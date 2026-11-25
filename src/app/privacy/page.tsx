import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/places";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} handles your data: no visitor accounts, Google Analytics for visit statistics, hashed IP addresses for rate limits.`,
};

const h2 = "mt-8 text-lead font-bold";
const p = "mt-2 text-body text-ink-2";
const li = "mt-2 grid list-disc gap-2 ps-5 text-body text-ink-2";

/** What Ondor collects (very little) and why. Written to match what the code actually does. */
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8 pb-16 md:py-12">
      <Link href="/" className="text-meta font-semibold text-accent hover:text-accent-hover">
        ← মানচিত্রে ফিরুন
      </Link>
      <h1 className="mt-4 text-display font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-meta text-muted">{SITE.name} · {SITE.domain}</p>

      <p className={p}>
        {SITE.name} দেখতে কোনো অ্যাকাউন্ট লাগে না। আমরা বিজ্ঞাপন দেখাই না এবং কারও তথ্য বিক্রি করি না। সাইটটি কতজন দেখছেন ও কোন পাতা বেশি পড়া হচ্ছে, তা বুঝতে Google Analytics ব্যবহার করি (নিচে বিস্তারিত)।
      </p>

      <h2 className={h2}>যা সংরক্ষিত হয়</h2>
      <ul className={li}>
        <li>
          <span className="font-semibold">IP ঠিকানা (হ্যাশ করে):</span> মানচিত্রে ক্লিক করলে AI নতুন গল্প লেখে। অপব্যবহার ঠেকাতে প্রতি ঘণ্টায় ও দিনে কয়টি গল্প লেখা যাবে, তার একটি সীমা আছে।
          সেজন্য আপনার IP ঠিকানা একটি গোপন চাবি দিয়ে একমুখী হ্যাশ করে রাখা হয়, সঙ্গে কোন জায়গার গল্প ও কখন। আসল IP ঠিকানা কখনো সংরক্ষিত হয় না, আর হ্যাশ থেকে আপনাকে চেনা যায় না।
        </li>
        <li>
          <span className="font-semibold">&ldquo;ভুল জানান&rdquo;:</span> আপনি যে বার্তা লেখেন, শুধু সেটুকু, সংশ্লিষ্ট গল্পের সঙ্গে। নাম বা ইমেইল চাওয়া হয় না; বার্তায় ব্যক্তিগত তথ্য না লেখাই ভালো।
        </li>
        <li>
          <span className="font-semibold">পছন্দ / অপছন্দ:</span> কোনো জায়গায় 👍 বা 👎 ক্লিক করলে আপনার ব্রাউজারে একটি এলোমেলো, বেনামি আইডি (কুকি) রাখা হয়, যাতে একজন একটি জায়গায় একবারই ভোট দিতে
          পারেন। আমাদের কাছে সেই আইডি হ্যাশ করে রাখা হয়, সঙ্গে কোন জায়গায় কী ভোট দিয়েছেন। এতে আপনার নাম, ইমেইল বা IP ঠিকানা থাকে না। পছন্দের সংখ্যা সবাই দেখে; অপছন্দের সংখ্যা শুধু
          সম্পাদক।
        </li>
        <li>
          <span className="font-semibold">গল্প ও ঘটনা:</span> AI-এর লেখা গল্প সবার জন্য সংরক্ষিত থাকে, যাতে পরের জন আবার অপেক্ষা না করে। এতে কোনো দর্শকের তথ্য থাকে না।
        </li>
      </ul>

      <h2 className={h2}>যা শুধু আপনার ডিভাইসে থাকে</h2>
      <ul className={li}>
        <li>সাম্প্রতিক খোঁজা জায়গার তালিকা ও &ldquo;টিপ দেখেছি&rdquo; চিহ্ন, আপনার ব্রাউজারের localStorage-এ। আমাদের সার্ভারে যায় না; ব্রাউজারের ডেটা মুছলে মুছে যায়।</li>
        <li>
          <span className="font-semibold">&ldquo;আমার কাছাকাছি&rdquo;:</span> অনুমতি দিলে আপনার অবস্থান শুধু আপনার ব্রাউজারেই ব্যবহার হয়, কাছের জায়গা দেখাতে। আমাদের সার্ভারে পাঠানো বা সংরক্ষণ করা হয় না।
        </li>
      </ul>

      <h2 className={h2}>Google Analytics ও কুকি</h2>
      <p className={p}>
        দর্শকসংখ্যা ও ব্যবহারের ধরন বুঝতে আমরা Google Analytics ব্যবহার করি। এটি আপনার ব্রাউজারে কুকি রাখে এবং Google-কে পাঠায়: কোন পাতা দেখা হলো, কতক্ষণ, কোন দেশ বা শহর থেকে (আনুমানিক), কোন ডিভাইস ও
        ব্রাউজার, এবং কোন সাইট থেকে এসেছেন। আমরা এই তথ্য শুধু সামগ্রিক পরিসংখ্যান হিসেবে দেখি; আপনার নাম, ইমেইল বা এই সাইটে লেখা কিছু পাঠানো হয় না। সম্পাদকদের অ্যাডমিন পাতায় Google Analytics নেই।
      </p>
      <p className={p}>
        না চাইলে ব্রাউজারের সেটিংসে কুকি বন্ধ করতে পারেন, বা Google-এর{" "}
        <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer" className="underline hover:text-ink">
          Google Analytics Opt-out
        </a>{" "}
        ব্যবহার করতে পারেন। Google কীভাবে এই তথ্য ব্যবহার করে:{" "}
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer" className="underline hover:text-ink">
          policies.google.com
        </a>
        ।
      </p>

      <h2 className={h2}>যেসব সেবা ব্যবহার হয়</h2>
      <p className={p}>সাইটটি চালাতে কিছু বাইরের সেবা লাগে; আপনার ব্রাউজার বা আমাদের সার্ভার তাদের সঙ্গে যোগাযোগ করে, তাই তারা নিজেদের নীতিমালা অনুযায়ী সাধারণ প্রযুক্তিগত তথ্য (যেমন IP ঠিকানা) দেখতে পারে:</p>
      <ul className={li}>
        <li>
          <span className="font-semibold">Google Gemini:</span> গল্প লিখতে। শুধু জায়গার নাম ও প্রসঙ্গ পাঠানো হয়, আপনার কোনো তথ্য নয়।
        </li>
        <li>
          <span className="font-semibold">OpenFreeMap ও OpenStreetMap (Photon, Nominatim):</span> মানচিত্রের ছবি ও জায়গা খোঁজা।
        </li>
        <li>
          <span className="font-semibold">Wikipedia ও Wikimedia Commons:</span> সূত্র ও ছবি।
        </li>
        <li>
          <span className="font-semibold">Supabase:</span> আমাদের ডেটাবেস (ওপরের তথ্য এখানেই থাকে); <span className="font-semibold">Vercel:</span> সাইট চালানো;{" "}
          <span className="font-semibold">Google Analytics:</span> দর্শক-পরিসংখ্যান।
        </li>
      </ul>

      <h2 className={h2}>সম্পাদকদের লগইন</h2>
      <p className={p}>শুধু সম্পাদকেরা ইমেইল দিয়ে লগইন করেন (Supabase-এর মাধ্যমে)। সাধারণ দর্শকদের লগইন বা অ্যাকাউন্ট নেই।</p>

      <h2 className={h2}>পরিবর্তন</h2>
      <p className={p}>এই নীতিমালা বদলালে এই পাতায় জানানো হবে। সর্বশেষ হালনাগাদ: ১৬ নভেম্বর ২০২৬।</p>
    </article>
  );
}
