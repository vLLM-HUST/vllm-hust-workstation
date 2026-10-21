import { describe, expect, it } from "vitest";
import { decodeChatSession, encodeChatSession } from "./chatSession";

const message = {id:"old",role:"assistant" as const,timestamp:1792400000000,content:"## 旧回答\n\n| A |\n| --- |\n| 4 |\n\n$$x^2$$",reasoning:"思考独立保留",completionStatus:"completed" as const};
describe("lossless local-only chat recovery", () => {
  it("round trips old raw Markdown, math, reasoning and terminal state without regeneration", () => {
    expect(decodeChatSession(encodeChatSession([message])).messages).toEqual([message]);
  });
  it("marks interrupted live generation truthfully, never auto-resumes or marks success", () => {
    const restored = decodeChatSession(encodeChatSession([message], true));
    expect(restored.messages[0].completionStatus).toBe('interrupted');
    expect(restored.messages[0].content).toBe(message.content); expect(restored.streaming).toBe(false);
  });
  it.each([{}, {version:1,messages:[{...message,role:'system'}]}, {version:1,messages:[message,message]},
    {version:1,messages:[{...message,content:null}]}, {version:1,messages:[{...message,completionStatus:'fake'}]}])('rejects unsupported/corrupt imports without partial truncation', data => {
    expect(()=>decodeChatSession(JSON.stringify(data))).toThrow();
  });
  it("ignores unknown fields instead of granting imported markup or credentials special behavior", () => {
    expect(decodeChatSession(JSON.stringify({version:1,messages:[{...message,html:'<script>',token:'ignored'}]})).messages).toEqual([message]);
  });
  it("never treats imported or interrupted advisory metadata as a trusted live SAGE result", () => {
    const restored=decodeChatSession(JSON.stringify({version:1,messages:[{...message,advisory:{status:"ready",report:{status:"correct"}}}]}));
    expect(restored.messages[0]).not.toHaveProperty("advisory");
    expect(restored.messages[0].content).toBe(message.content);
  });
});
