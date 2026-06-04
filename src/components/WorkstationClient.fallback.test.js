#!/usr/bin/env node
/**
 * Standalone test for WorkstationClient streaming fallback logic.
 * Compatible with Node.js 12+ (no ESM, no vitest needed).
 *
 * Run: node src/components/WorkstationClient.fallback.test.js
 *
 * Tests that when a model generates only reasoning_content tokens
 * and no regular content tokens, the fallback renders reasoning in the chat bubble.
 */
'use strict';

// ── Logic under test (mirrored from WorkstationClient.tsx) ──────────────────

function parseThinkContent(raw) {
  var open = raw.indexOf('<think>');
  if (open === -1) return { think: '', main: raw };
  var close = raw.indexOf('</think>', open);
  if (close === -1) return { think: raw.slice(open + 7), main: raw.slice(0, open) };
  return { think: raw.slice(open + 7, close), main: raw.slice(0, open) + raw.slice(close + 8) };
}

/**
 * Simulates the core streaming loop + finally block from handleSend.
 */
function simulateStreamingResponse(sseChunks) {
  var fullContent = '';
  var rawContent = '';
  var streamThink = '';
  var firstToken = true;
  var firstTokenTs = 0;
  var startTs = 1000;

  for (var i = 0; i < sseChunks.length; i++) {
    var chunk = sseChunks[i];
    var lines = chunk.split('\n');
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];
      if (!line.startsWith('data: ')) continue;
      var data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        var json = JSON.parse(data);

        // reasoning_content handling
        var reasoningDelta = (json.choices && json.choices[0] && json.choices[0].delta &&
          json.choices[0].delta.reasoning_content) || '';
        if (typeof reasoningDelta === 'string' && reasoningDelta) {
          streamThink += reasoningDelta;
          if (firstToken) {
            firstTokenTs = startTs + 100;
            firstToken = false;
          }
        }

        // content handling
        var delta = (json.choices && json.choices[0] && json.choices[0].delta &&
          json.choices[0].delta.content) || '';
        if (delta) {
          if (firstToken) {
            firstTokenTs = startTs + 200;
            firstToken = false;
          }
          rawContent += delta;
          var parsed = parseThinkContent(rawContent);
          fullContent = parsed.main.trimStart() || parsed.main;
        }
      } catch (e) { /* skip malformed */ }
    }
  }

  // Finally block: fallback logic
  if (!fullContent && streamThink) {
    fullContent = streamThink;
  }
  var finalContent = fullContent.trim();
  var words = finalContent.split(/\s+/).filter(Boolean).length;

  return { fullContent: finalContent, streamThink: streamThink, firstTokenTs: firstTokenTs, tokensUsed: words };
}

// ── Test helpers ────────────────────────────────────────────────────────────

function makeSSEChunk(delta) {
  var payload = { choices: [{ delta: delta, finish_reason: null }] };
  return 'data: ' + JSON.stringify(payload) + '\n';
}

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + msg);
  } else {
    failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + msg);
  } else {
    failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + msg);
    console.log('    expected: ' + JSON.stringify(expected));
    console.log('    actual:   ' + JSON.stringify(actual));
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log('\n\x1b[1mparseThinkContent\x1b[0m');

(function() {
  var r = parseThinkContent('Hello world');
  assertEqual(r.think, '', 'no <think> tag → think is empty');
  assertEqual(r.main, 'Hello world', 'no <think> tag → main is full text');
})();

(function() {
  var r = parseThinkContent('<think>I am thinking...');
  assertEqual(r.think, 'I am thinking...', 'open tag only → extracts think (streaming)');
  assertEqual(r.main, '', 'open tag only → main is empty');
})();

(function() {
  var r = parseThinkContent('<think>reasoning</think>The answer');
  assertEqual(r.think, 'reasoning', 'complete tags → extracts think');
  assertEqual(r.main, 'The answer', 'complete tags → extracts main');
})();

console.log('\n\x1b[1mStreaming fallback: reasoning_content only (no regular content)\x1b[0m');

(function() {
  var chunks = [
    makeSSEChunk({ reasoning_content: '快速排序的基本思想是' }),
    makeSSEChunk({ reasoning_content: '选择一个基准元素，' }),
    makeSSEChunk({ reasoning_content: '将数组分成两部分。' }),
    'data: [DONE]\n',
  ];
  var result = simulateStreamingResponse(chunks);

  assertEqual(
    result.fullContent,
    '快速排序的基本思想是选择一个基准元素，将数组分成两部分。',
    'fallback uses reasoning content as message when no content tokens'
  );
  assert(result.tokensUsed > 0, 'token count is > 0');
})();

(function() {
  var chunks = [
    makeSSEChunk({ reasoning_content: 'thinking...' }),
    'data: [DONE]\n',
  ];
  var result = simulateStreamingResponse(chunks);
  assert(result.firstTokenTs > 0, 'TTFT recorded from reasoning tokens');
})();

(function() {
  var chunks = [
    makeSSEChunk({ reasoning_content: 'I should use quicksort' }),
    makeSSEChunk({ content: 'Here is the implementation:' }),
    makeSSEChunk({ content: '\ndef quicksort(arr): ...' }),
    'data: [DONE]\n',
  ];
  var result = simulateStreamingResponse(chunks);

  assertEqual(
    result.fullContent,
    'Here is the implementation:\ndef quicksort(arr): ...',
    'prefers regular content over reasoning when both present'
  );
  assertEqual(result.streamThink, 'I should use quicksort', 'reasoning still captured separately');
})();

(function() {
  var chunks = ['data: [DONE]\n'];
  var result = simulateStreamingResponse(chunks);
  assertEqual(result.fullContent, '', 'empty stream → empty content');
  assertEqual(result.tokensUsed, 0, 'empty stream → 0 tokens');
})();

(function() {
  // Reproduces the exact bug from the screenshot
  var reasoningParts = [
    '快速排序算法，是通过选择一个基准元素，',
    '将数组分成两部分，一部分比基准小，另一部分比基准大，',
    '然后递归地对这两部分排序。',
    '首先，我需要确定如何选择基准元素。',
    '常见的做法有选第一个元素、最后一个元素，或者中间元素，甚至随机选择。',
    '为了简单起见，可能选中间的元素或者最后一个元素比较容易实现。',
    '比如，这里可能用分治的方法，比如hoare分区或者lomuto分区。不过',
  ];
  var chunks = reasoningParts.map(function(text) {
    return makeSSEChunk({ reasoning_content: text });
  });
  chunks.push('data: [DONE]\n');

  var result = simulateStreamingResponse(chunks);
  var expected = reasoningParts.join('');

  assertEqual(result.fullContent, expected, '[BUG REPRO] long reasoning with no content → renders thinking');
  assert(result.tokensUsed > 0, '[BUG REPRO] token count is > 0');
  assert(result.firstTokenTs > 0, '[BUG REPRO] TTFT is recorded');
})();

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n\x1b[1mResults: ' + passed + ' passed, ' + failed + ' failed\x1b[0m\n');
process.exit(failed > 0 ? 1 : 0);
