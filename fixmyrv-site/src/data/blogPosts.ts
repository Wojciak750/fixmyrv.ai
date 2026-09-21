export interface BlogPost {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  category: "Electrical" | "Plumbing" | "Propane" | "Appliances" | "HVAC" | "General" | "Slide Outs" | "RV Watchdog";
  publishDate: string;   // ISO YYYY-MM-DD
  lastUpdated: string;   // ISO YYYY-MM-DD
  readTime: string;
  image?: string;        // absolute URL for OG/Article image; falls back to site default
  relatedSlugs: string[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "rv-water-heater-not-working",
    title: "RV Water Heater Not Working: Complete Troubleshooting Guide",
    metaTitle: "RV Water Heater Not Working? Step by Step Fix Guide | FixMyRV.ai",
    metaDescription: "Your RV water heater stopped working? Diagnose Suburban, Atwood, Furrion, and Girard units fast. Step by step guide from experienced RV technicians.",
    excerpt: "Diagnose why your RV water heater stopped heating. Covers tank and tankless units, propane and electric modes, error codes, and when to call a pro.",
    category: "Plumbing",
    publishDate: "2026-07-19",
    lastUpdated: "2026-07-19",
    readTime: "6 min read",
    relatedSlugs: ["rv-furnace-wont-ignite", "rv-converter-not-charging"]
  },
  {
    slug: "rv-ac-not-cooling",
    title: "RV Air Conditioner Not Cooling: Complete Diagnostic Guide",
    metaTitle: "RV AC Not Cooling? Diagnose It Step by Step | FixMyRV.ai",
    metaDescription: "RV air conditioner running but not cooling? Diagnose Dometic and Coleman rooftop units fast. Capacitors, coils, freeze ups, and power problems explained.",
    excerpt: "Your rooftop AC runs but the air is warm. Walk through the exact diagnostic sequence for Dometic and Coleman units, from dirty coils to failed capacitors.",
    category: "HVAC",
    publishDate: "2026-07-19",
    lastUpdated: "2026-09-21",
    readTime: "6 min read",
    relatedSlugs: ["rv-ac-repair-or-replace", "rv-converter-not-charging", "rv-fridge-not-cooling-propane"]
  },
  {
    slug: "rv-ac-repair-or-replace",
    title: "RV Air Conditioner: Repair It or Replace It?",
    metaTitle: "RV Air Conditioner: Repair or Replace? Real Costs and How to Tell",
    metaDescription: "Most RV air conditioners that quit have a part that costs under $100. Real repair and replacement costs, how to test the capacitor, and when a new unit is the right call.",
    excerpt: "Told you need a new rooftop AC? Most units that quit have a failed part that costs under $100. Real repair and replacement costs, the checks to run, and how to test the capacitor.",
    category: "HVAC",
    publishDate: "2026-09-21",
    lastUpdated: "2026-09-21",
    readTime: "22 min read",
    relatedSlugs: ["rv-ac-not-cooling", "rv-converter-not-charging", "rv-fridge-not-cooling-propane"]
  },
  {
    slug: "rv-fridge-not-cooling-propane",
    title: "RV Refrigerator Not Cooling on Propane: Fix Guide",
    metaTitle: "RV Fridge Not Cooling on Propane? Fix It Step by Step | FixMyRV.ai",
    metaDescription: "Dometic or Norcold fridge works on electric but not propane? Burner cleaning, flame checks, and the leveling rule explained by experienced RV technicians.",
    excerpt: "Absorption fridges are picky about propane. Walk through the burner, flame, and leveling checks that fix most cooling failures on Dometic and Norcold units.",
    category: "Appliances",
    publishDate: "2026-07-19",
    lastUpdated: "2026-07-19",
    readTime: "6 min read",
    relatedSlugs: ["rv-furnace-wont-ignite", "rv-ac-not-cooling"]
  },
  {
    slug: "rv-furnace-wont-ignite",
    title: "RV Furnace Won't Ignite: Troubleshooting Sequence",
    metaTitle: "RV Furnace Won't Ignite? The Exact Diagnostic Order | FixMyRV.ai",
    metaDescription: "RV furnace blows cold air or won't start? Follow the sail switch, igniter, and gas valve sequence experienced techs use on Suburban and Dometic furnaces.",
    excerpt: "Fan runs but no heat? The furnace ignition chain fails in a predictable order. Learn the sail switch, limit switch, and igniter checks that find it fast.",
    category: "Propane",
    publishDate: "2026-07-19",
    lastUpdated: "2026-07-19",
    readTime: "6 min read",
    relatedSlugs: ["rv-water-heater-not-working", "rv-fridge-not-cooling-propane"]
  },
  {
    slug: "rv-converter-not-charging",
    title: "RV Converter Not Charging Batteries: How to Diagnose",
    metaTitle: "RV Converter Not Charging? Test It in 10 Minutes | FixMyRV.ai",
    metaDescription: "Batteries dead even on shore power? Test your RV converter with a multimeter in minutes. Fuses, voltage checks, and when the converter is actually bad.",
    excerpt: "Plugged into shore power but your batteries keep dying? Here is the ten minute multimeter test that tells you whether the converter is actually the problem.",
    category: "Electrical",
    publishDate: "2026-07-19",
    lastUpdated: "2026-07-19",
    readTime: "5 min read",
    relatedSlugs: ["rv-water-heater-not-working", "rv-slide-out-stuck"]
  },
  {
    slug: "rv-slide-out-stuck",
    title: "RV Slide Out Won't Extend or Retract: Step by Step Fix",
    metaTitle: "RV Slide Out Stuck? Diagnose and Fix It Step by Step | FixMyRV.ai",
    metaDescription: "RV slide out stuck in or out? Diagnose electric and hydraulic slide systems, find the manual override, and get moving again. Guide from experienced RV techs.",
    excerpt: "A stuck slide can strand your whole trip. Learn the diagnostic order for electric and hydraulic systems, where the manual override lives, and what not to force.",
    category: "Slide Outs",
    publishDate: "2026-07-19",
    lastUpdated: "2026-07-19",
    readTime: "6 min read",
    relatedSlugs: ["rv-converter-not-charging", "rv-water-heater-not-working"]
  },
  {
    slug: "rv-buyer-betrayal",
    title: "The RV Buyer Betrayal: How They Engineered the Perfect Scam",
    metaTitle: "The RV Buyer Betrayal: A FixMyRV.ai Investigation",
    metaDescription: "How Camping World, Thor, Forest River and Winnebago engineered a system that strips RV buyers of legal recourse while shipping defective products at scale. A six part FixMyRV.ai investigation.",
    excerpt: "Brennan McAuley was on the interstate when his RV tried to kill him. Two weeks earlier he had handed Camping World ninety nine thousand dollars for a brand new Thor Tellaro. What he actually bought, it turned out, was a stack of paperwork he had signed without reading.",
    category: "RV Watchdog",
    publishDate: "2026-07-19",
    lastUpdated: "2026-07-19",
    readTime: "17 min read",
    relatedSlugs: ["indiana-trap-rv-lawsuit", "rv-purchase-contract-clauses", "rv-quality-crisis-recalls", "camping-world-lawsuits-complaints", "canada-rv-lemon-law-camvap"]
  },
  {
    slug: "indiana-trap-rv-lawsuit",
    title: "The Indiana Trap: How Every RV Lawsuit Ends Up in Elkhart",
    metaTitle: "The Indiana Trap: Why Every RV Lawsuit Ends Up in Elkhart",
    metaDescription: "Forum selection clauses in Thor, Jayco and Forest River contracts funnel every warranty dispute to Indiana. Here is how the trap works and why it almost always wins. Part 2 of the RV Buyer Betrayal series.",
    excerpt: "There is a small town in northern Indiana that most Americans have never heard of. If you have ever bought a new RV, there is a very good chance that the moment your problems started, you became a citizen of that town. You just did not know it.",
    category: "RV Watchdog",
    publishDate: "2026-07-20",
    lastUpdated: "2026-07-20",
    readTime: "11 min read",
    relatedSlugs: ["rv-buyer-betrayal", "rv-purchase-contract-clauses", "rv-quality-crisis-recalls", "camping-world-lawsuits-complaints", "canada-rv-lemon-law-camvap"]
  },
  {
    slug: "rv-purchase-contract-clauses",
    title: "The Contract You Did Not Read: Five Clauses That Cost You Everything",
    metaTitle: "RV Purchase Contracts: The 5 Clauses That Strip Your Rights",
    metaDescription: "Every RV purchase contract contains five clauses that quietly eliminate your right to return, sue, or recover damages. Here is exactly what they say and how to fight back. Part 3 of the RV Buyer Betrayal series.",
    excerpt: "There is a moment in every RV purchase when the salesperson slides a stack of paper in front of you. Hidden in those pages are five clauses that have nothing to do with price or financing. They have to do with what happens when your brand new RV breaks.",
    category: "RV Watchdog",
    publishDate: "2026-07-21",
    lastUpdated: "2026-07-21",
    readTime: "9 min read",
    relatedSlugs: ["rv-buyer-betrayal", "indiana-trap-rv-lawsuit", "rv-quality-crisis-recalls", "camping-world-lawsuits-complaints", "canada-rv-lemon-law-camvap"]
  },
  {
    slug: "rv-quality-crisis-recalls",
    title: "The Quality Collapse: How Forest River Out Recalled Ford",
    metaTitle: "The RV Quality Collapse: Recall Data Names the Worst Brands",
    metaDescription: "Forest River issued more recalls than Ford or Chrysler in the last decade. Winnebago warranty claims rose 290 percent. The data names the brands and the patterns. Part 4 of the RV Buyer Betrayal series.",
    excerpt: "In the entire decade from 2015 to 2024, no automaker in America issued more recalls than Forest River. Not Ford. Not General Motors. Nearly half of those recalls were not parts that failed in the field. They were manufacturing errors.",
    category: "RV Watchdog",
    publishDate: "2026-07-22",
    lastUpdated: "2026-07-22",
    readTime: "12 min read",
    relatedSlugs: ["rv-buyer-betrayal", "indiana-trap-rv-lawsuit", "rv-purchase-contract-clauses", "camping-world-lawsuits-complaints", "canada-rv-lemon-law-camvap"]
  },
  {
    slug: "camping-world-lawsuits-complaints",
    title: "Camping World On Trial: The Dealer That Cannot Stop Getting Sued",
    metaTitle: "Camping World Lawsuits: AG Settlements and Consumer Harm",
    metaDescription: "Camping World paid Oregon 3.5 million dollars for deceptive pricing. A dozen lawsuits cluster in Charleston alone. Inside the dealer that became a national consumer complaint magnet. Part 5 of the RV Buyer Betrayal series.",
    excerpt: "If you have ever bought an RV, there is a roughly one in three chance you bought it from Camping World. In December 2024, the Attorney General of Oregon made it write a check for three and a half million dollars for systematically lying to its customers.",
    category: "RV Watchdog",
    publishDate: "2026-07-23",
    lastUpdated: "2026-07-23",
    readTime: "11 min read",
    relatedSlugs: ["rv-buyer-betrayal", "indiana-trap-rv-lawsuit", "rv-purchase-contract-clauses", "rv-quality-crisis-recalls", "canada-rv-lemon-law-camvap"]
  },
  {
    slug: "canada-rv-lemon-law-camvap",
    title: "The Canadian Vacuum: Why Your RV Has No Lemon Law In Canada",
    metaTitle: "Canadian RV Owners Have No Lemon Law Protection. Here Is Why.",
    metaDescription: "Canada has no lemon law and CAMVAP excludes most towable RVs. Canadian RV buyers have less protection than Americans. Part 6 of the RV Buyer Betrayal series.",
    excerpt: "Here is a question with a worse answer than you think. If you live in Toronto and you bought a defective RV from a dealer in Mississauga, who do you sue? There is a regulatory hole in Canada the size of a Class A motorhome.",
    category: "RV Watchdog",
    publishDate: "2026-07-24",
    lastUpdated: "2026-07-24",
    readTime: "9 min read",
    relatedSlugs: ["rv-buyer-betrayal", "indiana-trap-rv-lawsuit", "rv-purchase-contract-clauses", "rv-quality-crisis-recalls", "camping-world-lawsuits-complaints"]
  }
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find(p => p.slug === slug);
}

export function getPostsByCategory(category: string): BlogPost[] {
  if (category === "All") return blogPosts;
  return blogPosts.filter(p => p.category === category);
}

export function getRelatedPosts(slugs: string[]): BlogPost[] {
  return blogPosts.filter(p => slugs.includes(p.slug));
}

// Sort by ISO date string descending (lexical sort is correct for YYYY-MM-DD, and avoids Date()/timezone bugs)
export function getRecentPosts(count: number): BlogPost[] {
  return [...blogPosts].sort((a, b) => b.publishDate.localeCompare(a.publishDate)).slice(0, count);
}

// Timezone-safe date formatter. new Date("2026-05-25") parses as UTC midnight and renders the
// PREVIOUS day in US timezones, so format from the parts directly.
export function formatPublishDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[m - 1]} ${d}, ${y}`;
}

export const categories = ["All", "RV Watchdog", "Electrical", "Plumbing", "Propane", "Appliances", "HVAC", "Slide Outs", "General"] as const;
