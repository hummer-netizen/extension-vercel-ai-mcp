export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 600, margin: "80px auto", padding: "0 20px" }}>
      <h1>🔗 Browsing Assistant API</h1>
      <p style={{ color: "#666", marginTop: 8 }}>
        This is the backend for the Webfuse Browsing Assistant extension.
      </p>
      <p style={{ marginTop: 16 }}>
        The chat endpoint is at <code>/api/chat</code>. Connect it to the
        Webfuse extension sidebar to give your users an AI that can browse for them.
      </p>
      <p style={{ marginTop: 16 }}>
        <a href="https://github.com/hummer-netizen/extension-vercel-ai-mcp">GitHub</a>
        {" · "}
        <a href="https://webfuse.com">Webfuse</a>
        {" · "}
        <a href="https://sdk.vercel.ai">Vercel AI SDK</a>
      </p>
    </main>
  );
}
