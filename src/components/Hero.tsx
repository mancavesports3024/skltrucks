import Link from "next/link";
import Image from "next/image";
import type { HeroContent, SocialContent } from "@/types/site-content";

interface HeroProps {
  content: HeroContent;
  social: SocialContent;
}

export default function Hero({ content, social }: HeroProps) {
  const headlineLines = content.headline.split("\n").filter(Boolean);

  return (
    <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden md:min-h-[85vh]">
      <Image
        src={content.image}
        alt="SKL Trucks inventory"
        fill
        className="object-cover"
        priority
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center text-white">
        <h1 className="font-oswald text-4xl font-bold uppercase leading-tight md:text-6xl md:leading-[1.15]">
          {headlineLines.map((line, index) => (
            <span key={index}>
              {line}
              {index < headlineLines.length - 1 && <br />}
            </span>
          ))}
        </h1>
        <Link
          href={content.buttonLink}
          className="mt-8 inline-block min-h-12 rounded-sm border-2 border-[#fc0527] bg-[#fc0527] px-8 py-3 font-poppins text-base font-medium text-white transition-colors hover:bg-transparent hover:text-white"
        >
          {content.buttonText}
        </Link>
        <div className="mt-6 flex justify-center gap-4">
          <a
            href={social.facebook}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            className="opacity-80 hover:opacity-100"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </a>
          <a
            href={social.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="opacity-80 hover:opacity-100"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
