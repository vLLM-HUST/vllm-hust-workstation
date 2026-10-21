# SAGE answer advisory

The browser finishes the original `/api/chat` stream and sets its native
completion state **before** independently calling `/api/advisory`. Only the
user question and original final content are sent, not reasoning, model settings
or credentials. Neither chat route nor inference engine waits for SAGE.

The proxy only accepts the fixed loopback `/audit` adapter, with a five-second
deadline. Browser advisory timeout is eight seconds. Responses are independently
bound to question/answer UTF-8 SHA256 digests and exact answer quotes. Failed,
stale or malformed advisories produce their own unavailable state, never a
correctness verdict or an answer-generation failure. Canceled/truncated answers
do not initiate automatic audits. No answer repairs, hidden retries or changes to
model/thinking/generation budget occur. Copies and subsequent chat history use
only original message content.

SAGE's initial scope is trusted-source **formula dependency** contracts: known
symbol meanings, missing dependencies, unresolved symbols and unsupported math.
It does not prove equations, coefficients, numbers or all factual statements.
Even `no_dependency_gap` explicitly does not mean an answer is correct. The
catalog and all checking logic live in SAGE; Workstation contains no KV formula
rules. The supplied catalog cites fixed-version public source, with derived
payload assumptions distinguishing full-attention KV from hybrid recurrent state.

The advisory appears as a minimal collapsed disclosure below the raw answer,
with issues, verbatim formula quote, full evidence URL and scope assumptions.
Imported/restored sessions deliberately do not trust stored advisory metadata;
they say no advisory record, without regenerating or editing the old answer.

Deployment: run `sage.serving.advisory_server` from a pinned SAGE release with
its operator-controlled catalog, loopback port55109. It requires only SAGE's
core dependencies and CPU, no inference key or second GPU model. Workstation's
default proxy is `http://127.0.0.1:55109/audit`; optional
`WORKSTATION_SAGE_ADVISORY_URL` must still be a loopback HTTP `/audit` URL.
Do not expose the sidecar publicly. Rollback the web release symlink and restart
only Workstation; stopping the sidecar leaves raw chat functional and marks
advisories unavailable. Never restart a shared inference engine for this feature.
Historical answers can be checked with “核验此回答” or “重新核验”. This uses the
nearest preceding user question and the unchanged final text, never generation,
reasoning, or an `/api/chat` call. Restored/imported advisory metadata is ignored;
users can request a fresh report without re-asking their original question.

