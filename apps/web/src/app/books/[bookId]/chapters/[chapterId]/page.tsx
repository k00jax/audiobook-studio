import { redirect } from "next/navigation";

export default async function ChapterRedirect({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId } = await params;
  redirect(`/books/${bookId}?chapter=${chapterId}`);
}
