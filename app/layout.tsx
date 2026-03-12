export const metadata = {
  title: "Browsing Assistant | Webfuse + Vercel AI SDK",
  description: "Chat with an AI that controls your browser",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
