interface SectionTitleProps {
  subtitle: string;
  title: string;
  centered?: boolean;
  light?: boolean;
}

export default function SectionTitle({ subtitle, title, centered, light }: SectionTitleProps) {
  return (
    <div className={centered ? "text-center" : ""}>
      <p className={`mb-2 text-sm font-semibold uppercase tracking-widest ${light ? "text-neutral-300" : "text-[#fc0527]"}`}>
        {subtitle}
      </p>
      <h2
        className={`text-3xl font-bold md:text-4xl ${light ? "text-white" : "text-black"}`}
        style={{ fontFamily: "var(--font-oswald)" }}
      >
        {title}
        <span className={`mt-2 block h-1 w-16 bg-[#fc0527] ${centered ? "mx-auto" : ""}`} />
      </h2>
    </div>
  );
}
