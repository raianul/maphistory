import type { Metadata } from "next";
import Link from "next/link";
import { FALLBACK_MODEL, GEMINI_MODEL } from "@/lib/ai/model";
import { CHANNEL, FACEBOOK_URL } from "@/lib/links";
import { SITE } from "@/lib/places";

export const metadata: Metadata = {
  title: "About Us",
  description: `${SITE.name} একটি AI-চালিত ওয়েবসাইট: গল্প ও সময়রেখা Google Gemini দিয়ে লেখা।`,
};

const h2 = "mt-8 text-lead font-bold";
const p = "mt-2 text-body text-ink-2";

/** About Ondor: what it is, and plainly, that its content is written by AI (Google Gemini). */
export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8 pb-16 md:py-12">
      <Link href="/" className="text-meta font-semibold text-accent hover:text-accent-hover">
        ← মানচিত্রে ফিরুন
      </Link>
      <h1 className="mt-4 text-display font-bold tracking-tight">{SITE.name}</h1>
      <p className="mt-1 text-lead text-muted">{SITE.tagline}</p>

      {/* The most important thing on this page, first and boxed. */}
      <section aria-labelledby="ai" className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft/50 p-4 md:p-5">
        <h2 id="ai" className="text-lead font-bold text-accent">
          এটি একটি AI-চালিত ওয়েবসাইট
        </h2>
        <p className="mt-2 text-body text-ink">
          এখানের সব গল্প, সারাংশ ও সময়রেখা কৃত্রিম বুদ্ধিমত্তা (AI) দিয়ে লেখা: Google-এর <span className="font-semibold">Gemini</span> মডেল (
          <code className="rounded bg-card px-1 text-meta">{GEMINI_MODEL}</code>; ব্যস্ত সময়ে <code className="rounded bg-card px-1 text-meta">{FALLBACK_MODEL}</code>)।
        </p>
        <p className="mt-2 text-body text-ink">
          <span className="font-semibold">AI ভুল করতে পারে।</span> নাম, তারিখ বা ঘটনার খুঁটিনাটি ভুল হতে পারে। গুরুত্বপূর্ণ কাজে ব্যবহারের আগে প্রতিটি লেখার নিচে দেওয়া সূত্র মিলিয়ে নিন।
        </p>
      </section>

      <h2 className={h2}>কী আছে এখানে</h2>
      <p className={p}>
        বাংলাদেশের মানচিত্রে প্রতিটি জায়গার পেছনের ইতিহাস। মানচিত্রে যেকোনো নামে (এলাকা, রাস্তা, মসজিদ, নদী) চাপলে সেই জায়গার গল্প আসে। &ldquo;আজকের দিনে&rdquo; দেখায় এই তারিখে ঘটে যাওয়া
        ঘটনা, মানচিত্রে ধাপে ধাপে।
      </p>

      <h2 className={h2}>কীভাবে লেখা হয়, আর কে দেখে</h2>
      <ul className="mt-2 grid list-disc gap-2 ps-5 text-body text-ink-2">
        <li>
          <span className="font-semibold">মানচিত্রের নামে চাপলে যে গল্প আসে:</span> AI তখনই লেখে, কেউ আগে থেকে যাচাই করেনি। প্রতিটি গল্পের নিচে মডেলের নাম ও সূত্র (থাকলে) দেওয়া থাকে। যেসব গল্পে &ldquo;✓ যাচাইকৃত&rdquo; লেখা, সেগুলোর তথ্য একজন সম্পাদক সূত্রের সঙ্গে মিলিয়ে দেখেছেন; সূত্রগুলো গল্পের নিচে দেওয়া।
        </li>
        <li>
          <span className="font-semibold">&ldquo;আজকের দিনে&rdquo;-র ঘটনা:</span> AI উইকিপিডিয়া, বাংলাপিডিয়া ও অন্যান্য ওয়েবসাইট পড়ে খসড়া লেখে; প্রতিটি দাবির পাশে সূত্রের উদ্ধৃতি মিলিয়ে দেখা হয়।
          তারপর একজন সম্পাদক পড়ে দেখে প্রকাশ করেন। তবুও লেখাটি AI-এর, তাই ভুল থাকতে পারে।
        </li>
        <li>
          <span className="font-semibold">মানচিত্রে স্থান:</span> AI কোনো স্থানাঙ্ক বানায় না; স্থান খোঁজা হয় OpenStreetMap-এ। অনেক স্থান &ldquo;আনুমানিক&rdquo; হিসেবে চিহ্নিত।
        </li>
      </ul>

      <h2 className={h2}>ভুল দেখলে</h2>
      <p className={p}>প্রতিটি গল্পের নিচে &ldquo;ভুল জানান&rdquo; বোতাম আছে। জানালে আমরা দেখে ঠিক করি বা লেখাটি সরিয়ে দিই।</p>

      <h2 className={h2}>আমাদের খুঁজে পাবেন</h2>
      <ul className="mt-2 grid list-disc gap-1 ps-5 text-body text-ink-2">
        <li>
          Facebook:{" "}
          <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" className="font-semibold text-accent underline hover:text-accent-hover">
            {SITE.name}
          </a>
        </li>
        <li>
          জায়গার ইতিহাস নিয়ে ভিডিও (YouTube):{" "}
          <a href={CHANNEL.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline hover:text-accent-hover">
            {CHANNEL.name}
          </a>
        </li>
      </ul>

      <h2 className={h2}>তথ্য ও কৃতজ্ঞতা</h2>
      <ul className="mt-2 grid list-disc gap-1 ps-5 text-body text-ink-2">
        <li>
          মানচিত্র: ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-ink">
            OpenStreetMap
          </a>{" "}
          অবদানকারী;{" "}
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="underline hover:text-ink">
            OpenFreeMap
          </a>
        </li>
        <li>ছবি: উইকিমিডিয়া কমন্স (প্রতিটি ছবির নিচে লেখক ও লাইসেন্স)</li>
        <li>সূত্র: উইকিপিডিয়া, বাংলাপিডিয়া ও প্রতিটি লেখার নিচে দেওয়া অন্যান্য সূত্র</li>
        <li>AI: Google Gemini</li>
      </ul>

      <p className="mt-10 border-t border-line pt-4 text-micro text-muted">
        {SITE.name} · {SITE.domain} ·{" "}
        <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink">
          Facebook
        </a>
      </p>
    </article>
  );
}
