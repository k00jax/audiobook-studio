import { redirect } from "next/navigation";

/** Auth was removed — send old bookmarks to the library home. */
export default function LoginRedirect() {
  redirect("/");
}
