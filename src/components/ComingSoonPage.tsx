export const pageHead = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} — EduAI` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — EduAI` },
    { property: "og:description", content: description },
  ],
});
