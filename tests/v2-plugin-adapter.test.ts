import { describe, expect, it } from "bun:test";
import { registerV2Adapter } from "../src/v2/adapter.js";

describe("OpenCode v2 plugin adapter", () => {
  it("registers the tool and bridges prompt, context, model, events, and cleanup", async () => {
    const hooks = new Map<string, (event: any) => Promise<void>>();
    let tool: any;
    let modelInput: any;
    let eventInput: any;
    let disposed = false;
    let resolveEvent!: () => void;
    const eventHandled = new Promise<void>((resolve) => {
      resolveEvent = resolve;
    });

    const ctx = {
      location: {
        directory: "/workspace/project",
        project: { id: "project", directory: "/workspace/project", canonical: "project" },
      },
      tool: {
        transform: async (callback: (editor: any) => void) => {
          callback({ add: (definition: any) => (tool = definition) });
        },
      },
      session: {
        hook: async (name: string, callback: (event: any) => Promise<void>) => {
          hooks.set(name, callback);
        },
        get: async () => ({ location: { directory: "/workspace/project" } }),
      },
      event: {
        async *subscribe({ signal }: { signal: AbortSignal }) {
          yield {
            type: "session.idle",
            location: { directory: "/workspace/project" },
            data: { sessionID: "ses-1" },
          };
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true })
          );
        },
      },
    } as any;

    const legacy = {
      tool: {
        memory: {
          description: "Memory tool",
          execute: async (args: any) => JSON.stringify({ success: true, args }),
        },
      },
      "chat.message": async (_input: any, output: any) => {
        output.parts.unshift({ type: "text", text: "remembered context", synthetic: true });
      },
      "chat.params": async (input: any) => {
        modelInput = input;
      },
      event: async (input: any) => {
        eventInput = input;
        resolveEvent();
      },
      dispose: async () => {
        disposed = true;
      },
    };

    const cleanup = await registerV2Adapter(ctx, legacy);

    expect(tool.name).toBe("memory");
    expect(
      JSON.parse(
        (
          await tool.execute(
            { mode: "help" },
            {
              sessionID: "ses-1",
              messageID: "msg-1",
              agent: "build",
            }
          )
        ).content
      )
    ).toEqual({ success: true, args: { mode: "help" } });

    await hooks.get("prompt")?.({
      sessionID: "ses-1",
      messageID: "msg-1",
      prompt: { text: "Implement V2" },
    });
    const contextEvent = {
      sessionID: "ses-1",
      model: { providerID: "anthropic", id: "claude" },
      system: [] as Array<{ type: string; text: string }>,
    };
    await hooks.get("context")?.(contextEvent);

    expect(contextEvent.system).toEqual([{ type: "text", text: "remembered context" }]);
    expect(modelInput).toEqual({
      message: { id: "msg-1" },
      model: { providerID: "anthropic", id: "claude" },
    });

    await eventHandled;
    expect(eventInput).toEqual({
      event: { type: "session.idle", properties: { sessionID: "ses-1" } },
    });

    await cleanup();
    expect(disposed).toBe(true);
  });
});
