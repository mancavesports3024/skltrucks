import Link from "next/link";

interface AdminPageHeaderProps {
  title: string;
  backHref?: string;
}

export default function AdminPageHeader({ title, backHref = "/admin" }: AdminPageHeaderProps) {
  return (
    <header className="bg-neutral-900 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
        <Link href={backHref} className="text-sm hover:text-[#fc0527]">
          ← Back to admin
        </Link>
        <h1 className="text-lg font-bold sm:text-xl">{title}</h1>
      </div>
    </header>
  );
}
