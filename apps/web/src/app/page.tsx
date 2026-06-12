import Link from "next/link";

import { listLibraryProjects } from "@/lib/books";

import { SyncRefreshButton } from "@/components/SyncRefreshButton";

import { getWatchFolder } from "@/lib/watch-library";



export const dynamic = "force-dynamic";



export default async function HomePage() {

  const books = listLibraryProjects();

  let watchLabel = "your watch folder";

  try {

    watchLabel = getWatchFolder();

  } catch {

    /* not configured */

  }



  return (

    <main className="mx-auto max-w-2xl px-4 py-10">

      <header className="mb-10 border-b border-[var(--border)] pb-6">

        <p className="text-sm uppercase tracking-widest text-[var(--muted)]">

          Book Reader

        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Library</h1>

        <p className="mt-2 text-sm text-[var(--muted)]">

          Projects are folders under{" "}

          <span className="font-mono text-xs">{watchLabel}</span>

        </p>

        <div className="mt-4">

          <SyncRefreshButton scope="library" />

        </div>

      </header>



      <nav className="mb-8 flex flex-wrap gap-3 text-sm">

        <Link href="/settings">Settings</Link>

      </nav>



      <section>

        <h2 className="mb-4 text-lg font-medium">Projects</h2>

        {books.length > 0 ? (

          <ul className="space-y-2">

            {books.map((book) => {

              const count = book.chapters?.[0]?.count ?? 0;

              return (

                <li key={book.id}>

                  <Link

                    href={`/books/${book.id}`}

                    className="block rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent-dim)]"

                  >

                    <span className="font-medium">{book.title}</span>

                    <span className="mt-1 block text-sm text-[var(--muted)]">

                      {count} chapter{count === 1 ? "" : "s"}

                    </span>

                  </Link>

                </li>

              );

            })}

          </ul>

        ) : (

          <p className="text-[var(--muted)]">

            No project folders found. Add a subfolder with chapter files under

            your watch folder, then use Refresh from folder.

          </p>

        )}

      </section>

    </main>

  );

}

