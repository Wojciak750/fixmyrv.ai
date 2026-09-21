import { Link } from "react-router-dom";
import BlogPostLayout from "@/components/blog/BlogPostLayout";
import { getPostBySlug } from "@/data/blogPosts";
import { SMS_HREF, SMS_PHONE_DISPLAY, trackSmsTap } from "@/lib/smsLink";

const SITE = "https://fixmyrv.ai";
const PAGE_URL = `${SITE}/blog/rv-ac-repair-or-replace`;
const AUTHOR_ID = `${SITE}/about#michael-wojciak`;
const PRICES_CHECKED = "September 2026";

/*
 * Cost table rows. The Agile figures come from Agile RV Housing repair records
 * and are used exactly as supplied. Every public price links to the retailer
 * or technician page it was taken from.
 */
interface PublicPrice {
  text: string;
  label: string;
  url: string;
}

interface CostRow {
  item: string;
  agile: string;
  publicPrices: PublicPrice[];
}

const COST_ROWS: CostRow[] = [
  {
    item: "Capacitor, Coleman Mach",
    agile: "$25 to $39",
    publicPrices: [
      { text: "$62.99, run capacitor 1499-5761", label: "Camping World", url: "https://www.campingworld.com/coleman-1499-5761-rv-ac-run-capacitor-127449.html" },
      { text: "$34.70, capacitor 1499-5721", label: "High Sky RV Parts", url: "https://highskyrvparts.com/coleman-mach-air-conditioner-capacitor-1499-5721" },
      { text: "$27.63, capacitor 1499-5421", label: "High Sky RV Parts", url: "https://highskyrvparts.com/coleman-mach-air-conditioner-capacitor-1499-5421" },
    ],
  },
  {
    item: "Capacitor, Dometic",
    agile: "$50 to $100",
    publicPrices: [
      { text: "$80.99, 50/5 MFD run capacitor", label: "Camping World", url: "https://www.campingworld.com/dometic-duo-therm-air-conditioner-motor-run-capacitor-505-mfd-147048.html" },
      { text: "$75.87, 35/5 MFD run capacitor 3100248.362", label: "Dyers RV", url: "https://www.dyersonline.com/dometic-3100248-362-capacitor-35-5-mfd.html" },
      { text: "$61.59, start capacitor 3310727.007", label: "High Sky RV Parts", url: "https://highskyrvparts.com/dometic-air-conditioner-capacitor-3310727-007" },
    ],
  },
  {
    item: "Fan motor",
    agile: "Not tracked separately",
    publicPrices: [
      { text: "$246.50 on sale, Coleman Mach 1468A3069", label: "Camping World", url: "https://www.campingworld.com/coleman-mach-fan-motor-for-60008000-series-air-conditioners-1468a3069-90023.html" },
      { text: "$219.99, Dometic Brisk Air II fan motor kit", label: "Camping World", url: "https://www.campingworld.com/fan-motor-kit-for-brisk-air-ii-104067.html" },
      { text: "$189.99 on sale, Dometic 3315332.005", label: "United RV Parts", url: "https://unitedrvparts.com/products/dometic-rv-air-conditioner-motor-3315332-005-4450013348-brisk-ii" },
    ],
  },
  {
    item: "Thermostat or control board",
    agile: "About $100",
    publicPrices: [
      { text: "$188.48, Dometic single zone thermostat with control board", label: "etrailer", url: "https://www.etrailer.com/Accessories-and-Parts/Dometic/DMC83ZR.html" },
      { text: "$130 on sale, Dometic thermostat with control kit", label: "Camping World", url: "https://www.campingworld.com/dometic-capacity-touch-thermostat-with-control-kit-coolfurnace-white-88471.html" },
      { text: "$145.99, Coleman Mach control box 8330-3851", label: "High Sky RV Parts", url: "https://highskyrvparts.com/rv-parts/appliances/air-conditioners/air-conditioners-replacement-parts/control-board-and-modules/coleman-mach-air-conditioner-control-box-assembly-8330-3851" },
    ],
  },
  {
    item: "Mobile tech visit",
    agile: "$150 service call plus $150 per hour",
    publicPrices: [
      { text: "$150 on-site fee plus $200 per hour", label: "Traveling RV Technicians, FL", url: "https://www.travelingrvtechnicians.com/rates" },
      { text: "$200 call fee plus $155 per hour", label: "RV Service Club, FL", url: "https://rvserviceclub.com/rv-repair/" },
      { text: "$140 trip fee plus $120 per hour", label: "RV Mobile Tech, GA", url: "https://rvmobiletech.net/rates" },
      { text: "$125 trip fee plus $125 per hour", label: "Hourglass Trailers, CO", url: "https://www.hourglasstrailers.com/ratespolicies" },
    ],
  },
  {
    item: "New rooftop unit, part only",
    agile: "$1,200 to $1,400",
    publicPrices: [
      { text: "$1,406.99, Dometic Brisk II 13,500 BTU", label: "High Sky RV Parts", url: "https://highskyrvparts.com/dometic-air-conditioner-b57915-xx1c0" },
      { text: "$1,183.83, Dometic Brisk II 13,500 BTU", label: "Dale's Super Store", url: "https://dalessuperstore.com/i-23903130-dometic-brisk-ii-air-unit-domb57915-xx1c0-rv.html" },
      { text: "$1,540.68, Dometic Penguin II 13,500 BTU", label: "PPL Motorhomes", url: "https://www.pplmotorhomes.com/parts/rv-appliances/air-conditioner/air-conditioners-coleman-dometic/penguin-low-profile-air-conditioner-13.5k-btu-black_640315CXX1J0" },
      { text: "$1,427.91 on sale, Dometic Penguin II high capacity with heat pump", label: "Camping World", url: "https://www.campingworld.com/dometic-penguin-ii-high-capacity-air-conditioner-with-heat-pump-630156.html" },
      { text: "$986.95, Coleman Mach 15 48204C866", label: "RV Products Shop", url: "https://www.rvproductsshop.com/coleman-mach-48204c866-15-000-btu-120v-air-conditioner-textured-white.html" },
      { text: "$1,007.95, Furrion Chill FACR15SA-PS", label: "High Sky RV Parts", url: "https://highskyrvparts.com/furrion-llc-air-conditioner-facr15sa-ps-facr15sa-ps" },
    ],
  },
  {
    item: "Full replacement, installed",
    agile: "Typically about $1,800, with a range of $750 to $2,600",
    publicPrices: [
      { text: "$300 to $600 in labor alone for a standard replacement, unit not included", label: "RV AC Unit, cost to install", url: "https://www.rvacunit.com/cost-to-install-rv-air-conditioner/" },
    ],
  },
];

const FAQS: { q: string; a: string; source?: PublicPrice }[] = [
  {
    q: "How much does it cost to replace an RV air conditioner?",
    a: "In Agile RV Housing's repair records, a new rooftop unit costs $1,200 to $1,400 for the part alone, and a full replacement installed typically comes to about $1,800, with a range of $750 to $2,600. The low end is a straight swap by a mobile tech. The high end includes a new ceiling assembly, a new thermostat, and shop labor.",
  },
  {
    q: "Can I replace my RV AC capacitor myself?",
    a: "Yes, if you are comfortable on the roof and with basic electrical work. The job is remove the shroud, discharge the old capacitor, photograph the wires, swap the part, and put it back together. The two things that hurt people are a charged capacitor and a fall, so follow the safety steps exactly. If either worries you, hire a tech.",
  },
  {
    q: "How do I know if my RV AC compressor is bad?",
    a: "You only know after the cheaper parts are ruled out. With good voltage, a capacitor that tests within its rating, clean coils, and a fan that runs, a compressor that hums and shuts off on its overload, or runs without ever cooling the air, has failed or lost its refrigerant. At that point the unit is replaced, not repaired.",
  },
  {
    q: "Can an RV air conditioner be recharged with refrigerant?",
    a: "Not the way a home system can. Rooftop RV units are built as sealed systems with no service ports, and low refrigerant means there is a leak. Federal law requires an EPA Section 608 certified technician for any work that opens the refrigerant circuit. A leaking rooftop unit is replaced because the repair costs more than it is worth.",
    source: { text: "", label: "EPA, Section 608 technician certification", url: "https://www.epa.gov/section608/section-608-technician-certification-requirements" },
  },
  {
    q: "How long does an RV air conditioner last?",
    a: "We could not find a manufacturer's published service life for rooftop units, so any number is a guess. Camping World's blog says most last 6 to 8 years with proper maintenance. Age matters less than the pattern. One failure on an older unit is a repair. Repeat failures mean you are buying a replacement one part at a time.",
    source: { text: "", label: "Camping World blog", url: "https://blog.campingworld.com/learn-to-rv/all-of-your-questions-about-rv-air-conditioners-answered/" },
  },
  {
    q: "Is it worth repairing an old RV air conditioner?",
    a: "Yes, if the repair is a capacitor, a thermostat, a control board, or a fan motor and it is the first failure. Those parts cost a fraction of a new unit. Replace instead when the compressor or sealed system has failed, when the unit keeps failing, or when the estimate is more than half the price of a new unit.",
  },
  {
    q: "Do I need a new thermostat when I replace my RV AC?",
    a: "Sometimes. A new unit has to work with the ceiling assembly and thermostat already in the RV. Staying with the same brand and control type usually means the existing wall thermostat works. Changing brands, or moving from a knob-controlled ceiling box to a wall thermostat, means new controls. Agile's records put a thermostat or control board at about $100.",
  },
  {
    q: "Can I install an RV air conditioner myself?",
    a: "Physically, a rooftop swap is bolts, wires, and a gasket, and many owners do it. The hard parts are getting a heavy unit onto the roof without hurting yourself or the roof, and sealing it so it never leaks. Coleman Mach recommends a licensed, trained technician for installation. If you have never done one, hire a mobile tech.",
    source: { text: "", label: "Airxcel, replacing an RV air conditioner", url: "https://blog.airxcel.com/replacing-an-rv-air-conditioner-everything-you-need-to-know/" },
  },
  {
    q: "Why does my RV AC hum but not start?",
    a: "A hum with no compressor start is the classic sign of a failed capacitor, and it is the cheapest thing on this page to fix. It can also be low voltage from a weak pedestal, a long extension cord, or an undersized generator. Check the voltage first, then the capacitor. Only after both check good do you consider the compressor.",
  },
  {
    q: "Should I use a mobile RV tech or a shop for AC replacement?",
    a: "A mobile tech swaps the unit in your driveway or at the campground, and you pay a service call plus hourly labor. A shop may have the unit in stock and a lift, but you wait for an appointment and bring the RV in. For a straight swap, a mobile tech is usually faster.",
  },
];

const CAPACITOR_STEPS: { name: string; text: string }[] = [
  {
    name: "Kill every power source",
    text: "Unplug shore power at the pedestal, shut off the generator, switch off the inverter, and switch off the air conditioner breaker in the RV's panel. Then turn the thermostat to cool and confirm nothing happens.",
  },
  {
    name: "Get on the roof safely",
    text: "Use a ladder rated for your weight, have someone hold it, and work only on a dry roof. Do not go up if your RV's roof is not rated for a person's weight.",
  },
  {
    name: "Remove the shroud",
    text: "Take out the shroud screws and lift the plastic cover straight up. Set the screws somewhere they cannot roll off the roof.",
  },
  {
    name: "Find the capacitor and discharge it",
    text: "Open the metal electrical box on the side of the unit. Discharge each capacitor with a discharge resistor across its terminals, then confirm with a multimeter that the terminals read close to zero volts before you touch them.",
  },
  {
    name: "Photograph the wiring and read the label",
    text: "Take a clear photo of every wire on every terminal. Write down the microfarad rating, the voltage rating, and the tolerance printed on the capacitor label. On a dual capacitor, note which number belongs to the compressor terminal and which to the fan terminal.",
  },
  {
    name: "Test the old capacitor",
    text: "Set a multimeter to its capacitance setting and read each capacitor with the wires removed. A reading outside the tolerance on the label, a bulged top, or oil on the case means the capacitor has failed. If it tests good, the capacitor is not your problem.",
  },
  {
    name: "Install the matching capacitor",
    text: "Fit a replacement with the same microfarad rating and a voltage rating equal to or higher than the original, then move each wire to the same terminal it came from, using your photo.",
  },
  {
    name: "Reassemble and test",
    text: "Close the electrical box, reinstall the shroud, restore power, and run the unit on cool. Listen for the compressor to start and feel for cold air at the ceiling vent within a few minutes.",
  },
];

const ARTICLE_AUTHOR = {
  "@type": "Person",
  "@id": AUTHOR_ID,
  name: "Michael Wojciak",
  jobTitle: "Founder",
  worksFor: { "@type": "Organization", name: "FixMyRV.ai", url: SITE },
  url: `${SITE}/about`,
};

const PERSON_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": AUTHOR_ID,
  name: "Michael Wojciak",
  jobTitle: "Founder",
  description:
    "Founder of FixMyRV.ai, 10 years in the RV rental industry, manages RV appliance repairs across Agile RV Housing placements nationwide.",
  worksFor: { "@type": "Organization", name: "FixMyRV.ai", url: SITE },
  affiliation: { "@type": "Organization", name: "Agile RV Housing" },
  url: `${SITE}/about`,
  knowsAbout: ["RV air conditioner repair", "RV appliance repair", "RV rental fleet operations"],
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const HOWTO_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to test and replace an RV air conditioner capacitor",
  description:
    "How to safely test and replace the run or start capacitor on a Coleman Mach or Dometic rooftop RV air conditioner, including how to discharge the old capacitor and match the rating on the new one.",
  tool: [
    { "@type": "HowToTool", name: "Multimeter with a capacitance setting" },
    { "@type": "HowToTool", name: "Capacitor discharge resistor with insulated leads" },
    { "@type": "HowToTool", name: "Screwdriver and nut driver set" },
    { "@type": "HowToTool", name: "Ladder rated for your weight" },
  ],
  supply: [{ "@type": "HowToSupply", name: "Replacement capacitor with the same microfarad rating" }],
  step: CAPACITOR_STEPS.map((s, i) => ({
    "@type": "HowToStep",
    position: i + 1,
    name: s.name,
    text: s.text,
    url: `${PAGE_URL}#capacitor-step-${i + 1}`,
  })),
};

/**
 * The text-us call to action used on this page. Same wording pattern and link as the
 * existing blog and mobile tech pages: free diagnosis by text, $49 for the full fix.
 */
function TextUsCta({ location }: { location: "midpage" | "footer" }) {
  return (
    <aside className="not-prose bg-rv-blue/10 rounded-2xl p-6 md:p-8 my-10">
      <h3 className="text-2xl font-bold mb-3" style={{ color: "#1E4785" }}>
        Before you buy a new unit, text us what it is doing
      </h3>
      <p className="text-gray-700">
        Text <span className="font-semibold">{SMS_PHONE_DISPLAY}</span> with your RV year, make, model, and
        AC brand, and tell us what the unit does when you turn it on. We will tell you whether it is likely a
        cheap part. The diagnosis is free. If you want the full step by step fix, it is $49 one time for 48 hours
        of unlimited help, backed by more than 50,000 pages of professional repair manuals curated by
        experienced RV technicians.
      </p>
      <a
        href={SMS_HREF}
        onClick={() => trackSmsTap("home", location)}
        className="inline-flex items-center justify-center mt-5 bg-rv-blue hover:bg-rv-blue/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        Text Your Problem Free
      </a>
      <p className="text-xs text-gray-500 mt-3">Free diagnosis. Pay $49 only if you want the full fix.</p>
    </aside>
  );
}

function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-rv-blue underline underline-offset-2">
      {label}
    </a>
  );
}

const RvAcRepairOrReplace = () => {
  const post = getPostBySlug("rv-ac-repair-or-replace");

  if (!post) {
    return null;
  }

  return (
    <BlogPostLayout
      post={post}
      author={ARTICLE_AUTHOR}
      extraJsonLd={[PERSON_SCHEMA, FAQ_SCHEMA, HOWTO_SCHEMA]}
      hideDefaultCta
    >
      <p>
        Most RV air conditioners that quit have a failed part that costs under $100, usually the capacitor. In
        Agile RV Housing's repair records, a typical repair runs $25 to $100 in parts, while a full replacement
        typically runs about $1,800 installed. Run the checks below in order and you will know which one you are
        facing before you spend anything.
      </p>

      <h2 id="cost">What does RV AC repair or replacement cost?</h2>

      <p>
        A capacitor costs $25 to $39 for a Coleman Mach and $50 to $100 for a Dometic. A thermostat or control
        board is about $100. A mobile tech charges a $150 service call plus $150 per hour. A new rooftop unit is
        $1,200 to $1,400, or about $1,800 installed. Those are Agile RV Housing's figures, checked against public
        prices below.
      </p>

      <p className="md:hidden text-xs text-gray-500 mb-2">The table scrolls sideways on a phone.</p>

      <div className="not-prose my-6 overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[680px] text-left text-sm md:text-base">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="p-3 border-b border-gray-200 font-semibold text-rv-gray-dark">Item</th>
              <th scope="col" className="p-3 border-b border-gray-200 font-semibold text-rv-gray-dark">What Agile RV Housing pays</th>
              <th scope="col" className="p-3 border-b border-gray-200 font-semibold text-rv-gray-dark">Public prices</th>
              <th scope="col" className="p-3 border-b border-gray-200 font-semibold text-rv-gray-dark">Source</th>
            </tr>
          </thead>
          <tbody>
            {COST_ROWS.map((row, rowIndex) => {
              const lines = row.publicPrices.length > 0 ? row.publicPrices : [null];
              const band = rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50/60";
              return lines.map((p, i) => {
                const last = i === lines.length - 1;
                const cell = `p-3 align-top text-gray-700 ${last ? "border-b border-gray-200" : ""}`;
                return (
                  <tr key={`${row.item}-${i}`} className={band}>
                    {i === 0 && (
                      <th scope="row" rowSpan={lines.length} className="p-3 align-top border-b border-gray-200 font-medium text-rv-gray-dark">
                        {row.item}
                      </th>
                    )}
                    {i === 0 && (
                      <td rowSpan={lines.length} className="p-3 align-top border-b border-gray-200 text-gray-700">
                        {row.agile}
                      </td>
                    )}
                    <td className={cell}>{p ? p.text : "No posted price found"}</td>
                    <td className={cell}>{p ? <SourceLink label={p.label} url={p.url} /> : <span aria-hidden="true">-</span>}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-600">
        The Agile RV Housing figures come from Agile RV Housing's repair records across more than 100 RV housing
        placements nationwide. Public prices checked {PRICES_CHECKED}. Retail prices change, so open the source
        link before you buy.
      </p>

      <TextUsCta location="midpage" />

      <h2 id="is-it-dead">Is my RV air conditioner actually dead?</h2>

      <p>
        Probably not. A rooftop unit has one expensive part, the compressor and the sealed refrigerant loop
        around it. Everything else that stops it from cooling is a part that costs less than a tech's service
        call. Run these eight checks in order, simplest first, and stop at the first one that explains what you
        are seeing.
      </p>

      <ol>
        <li>
          <strong>Power supply and breaker.</strong> Nothing happens at all, no fan and no hum, or the breaker
          trips the moment the unit tries to start. This points to power not reaching the unit: a tripped breaker
          in the RV panel or at the pedestal, a bad shore cord or adapter, a generator that is not putting out
          power, or an inverter that is not sized to run an air conditioner. If the fan runs but the compressor
          hums and gives up, check the voltage at an interior outlet with a plug-in meter while the unit tries to
          start. A long extension cord, a weak campground pedestal, or a small generator will sag under the
          compressor's starting load. Typical cost to fix: nothing, or a heavier cord.
        </li>
        <li>
          <strong>Thermostat settings and wiring.</strong> The fan runs but the compressor never starts, or nothing
          responds at all, or the unit never shuts off. Check that the mode is set to cool and not fan only, that
          the set point is below the room temperature, and that a wall thermostat has fresh batteries if it uses
          them. Both Coleman Mach and Dometic wall thermostats run on 12 volt power from the RV's house battery,
          so a dead battery or a blown 12 volt fuse can stop a unit that has perfect shore power. Look for a loose
          thermostat wire at the ceiling assembly. Typical cost to fix: nothing, or about $100 for a thermostat.
        </li>
        <li>
          <strong>Dirty filter and coils.</strong> Airflow at the vents is weak, the air is only slightly cool, and
          the unit runs all day without catching up. Pull the return air grille and wash or replace the filter. If
          the evaporator coil behind it is matted with dust and pet hair, clean it with coil cleaner and a soft
          brush. On the roof, the condenser coil at the back of the unit collects road grime and cottonwood fluff
          and cannot shed heat. Our guide to an{" "}
          <Link to="/blog/rv-ac-not-cooling">RV air conditioner that runs but does not cool</Link> walks through
          the cleaning in detail. Typical cost to fix: a can of coil cleaner.
        </li>
        <li>
          <strong>Frozen evaporator.</strong> The unit cools well at first, then after it has run a while the airflow drops to a
          trickle, and you can see ice behind the return grille or water dripping as it thaws. Ice comes from low
          airflow across the coil: a dirty filter, the fan on low speed, or a set point far too low in humid
          weather. Shut the compressor off, run the fan until the ice is gone, and fix the airflow. If it keeps
          freezing with a clean filter, high fan speed, and a sensible set point, the refrigerant charge is low,
          and that means a leak in the sealed system. Typical cost to fix: nothing if it is airflow, a
          replacement unit if it is the charge.
        </li>
        <li>
          <strong>Capacitor.</strong> The compressor hums for a few seconds and clicks off, tries to start and gives
          up, or starts only sometimes. The fan will not turn on its own but spins if you give it a push. The
          breaker trips when the compressor tries to start even though the voltage is fine. The capacitor's top is
          bulged or there is oil on the case. This is the most common hard part failure on a rooftop unit, and the
          test and swap are covered step by step below. Typical cost to fix: $25 to $39 on a Coleman Mach, $50 to
          $100 on a Dometic.
        </li>
        <li>
          <strong>Fan motor.</strong> The fan does not turn even with a capacitor that tests good, the motor is hot
          to the touch and smells burnt, it squeals or grinds, or it turns much slower than it used to. Because
          one motor drives both the indoor blower and the outdoor condenser fan on most rooftop units, a failing
          motor also causes freeze ups and high head pressure that shuts the compressor down. Agile does not track
          this part separately, so the price is in the table above from public listings. Replacing a motor means
          pulling the fan wheel and blade, which is beyond most owners, so plan on a tech for this one.
        </li>
        <li>
          <strong>Control board.</strong> The thermostat calls for cooling, the capacitor and motor test good, the
          voltage is good, and the board still never sends power to the compressor or the fan. You may hear relays
          clicking with nothing happening, see the unit behave differently every time you start it, or find a wall
          thermostat display that stays dark even with 12 volt power present. On Dometic units the board is in the
          box on the ceiling assembly or on the roof. On Coleman Mach units with a wall thermostat, it is in the
          control box on the ceiling assembly. Typical cost to fix: about $100 for the board.
        </li>
        <li>
          <strong>Compressor.</strong> With good voltage, a capacitor that tests within its rating, a running fan,
          and clean coils, the compressor hums and shuts off on its internal overload again and again, or it runs
          but the air at the vent never gets colder than the room. The first is a seized or shorted compressor.
          The second is a compressor that has lost its refrigerant. Neither is repaired on a rooftop unit, and
          this is the only item on the list that means replacement. Typical cost: $1,200 to $1,400 for a new unit,
          about $1,800 installed.
        </li>
      </ol>

      <p>
        Notice where the compressor sits. It is last, and it is the only failure that ends in a new unit. If
        someone tells you the unit is dead before checking the voltage and the capacitor, ask them to check.
      </p>

      <h2 id="capacitor">How do I test and replace an RV AC capacitor?</h2>

      <p>
        Cut all power, get on the roof, remove the shroud, discharge the capacitor, photograph the wiring, test
        the capacitor with a multimeter on its capacitance setting, and replace it with one that has the same
        microfarad rating and an equal or higher voltage rating. The steps below cover Coleman Mach and Dometic units, and the differences are small.
      </p>

      <h3>Before you touch anything</h3>

      <p>
        Before any work, disconnect shore power at the pedestal, turn off the generator, turn off the inverter,
        and switch off the air conditioner breaker in the RV's panel. All four. An inverter can put 120 volt power
        on the air conditioner circuit with the shore cord unplugged, and a generator on auto start can fire up
        while you are on the roof. Then set the thermostat to cool and confirm the unit stays silent.
      </p>

      <p>
        Capacitors hold a charge after the power is off, and a charged capacitor can give you a serious shock.
        HVAC PRO Sales describes the safe way to discharge one: connect a resistor of 10,000 to 20,000 ohms, rated
        at least 5 watts, across the terminals with insulated clip leads and hold it there for 30 seconds to a
        minute, then confirm with a multimeter set to volts that the terminals read zero (
        <SourceLink label="HVAC PRO Sales" url="https://hvacprosales.com/blog/how-to-safety-discharge-an-hvac-capacitor-complete-guide/" />
        ). Discharge tools built for this are sold at any HVAC supply house. Shorting the terminals with a bare
        screwdriver also works, but it makes a large spark that can pit the terminals and damage the capacitor,
        so use the resistor.
      </p>

      <h3>Roof safety</h3>

      <p>
        A fall from an RV roof is the most likely way this job hurts you. Use a ladder rated for your weight,
        have someone hold it, keep your weight over the roof rafters near the edges rather than in the center,
        and never work on a wet roof. Not every RV roof will hold a person. As Ask The RV Engineer puts it, a
        non-walkable roof is not rated to hold the weight of a person, and walking on one can crack a rafter or
        the decking and start a leak (
        <SourceLink label="Ask The RV Engineer" url="https://askthervengineer.com/what-is-a-walkable-rv-roof/" />
        ). Pop-up campers and soft-sided sections cannot take any weight at all. If your owner's manual does not
        say the roof is walkable, or if your RV has no factory ladder, assume it is not and use a sheet of plywood
        to spread your weight, or hand the job to a tech.
      </p>

      <h3>Where the capacitors are</h3>

      <p>
        On both brands the capacitors live on the roof under the plastic shroud, inside a metal electrical box
        on the side of the unit. On a Coleman Mach the box sits beside the compressor and holds the run capacitor
        for the compressor, the run capacitor for the fan, and on many models a start capacitor, which is a black
        plastic cylinder wired through a small relay. On a Dometic Brisk II or Penguin II the box is on the side of
        the base pan and usually holds a run capacitor and a start capacitor. Some units use one dual run
        capacitor with three terminals. Others use two or three separate capacitors. Replace only the one that
        fails the test, and photograph everything before you pull a wire.
      </p>

      <h3>How to read the rating and match it</h3>

      <p>
        The label on the capacitor gives you everything you need. The first number is the capacitance in
        microfarads, written as MFD or µF, and it is the number you must match exactly. The second number is the
        voltage rating in VAC. You can use a capacitor with a higher voltage rating than the original, but never a
        lower one. A dual run capacitor shows two capacitance numbers, for example 40 plus 5 µF, and has three
        terminals marked C for common, HERM for the compressor, and FAN for the fan motor. The larger number goes
        with the compressor and the smaller with the fan (
        <SourceLink label="Wikipedia, motor capacitor" url="https://en.wikipedia.org/wiki/Motor_capacitor" />
        ). Part numbers matter less than the rating. A Coleman Mach or Dometic branded capacitor and a generic
        motor run capacitor with the same MFD and voltage rating do the same job.
      </p>

      <h3>The steps</h3>

      <ol>
        {CAPACITOR_STEPS.map((s, i) => (
          <li key={s.name} id={`capacitor-step-${i + 1}`}>
            <strong>{s.name}.</strong> {s.text}
          </li>
        ))}
      </ol>

      <p>
        On the test in step six, HVAC School's rule is that most capacitors allow a tolerance of plus or minus 6
        percent, and a reading outside that range means the capacitor should be replaced (
        <SourceLink label="HVAC School" url="https://www.hvacrschool.com/capacitor-testing-and-replacement-procedure/" />
        ). If your meter has no capacitance setting, buy one that does. They cost less than the capacitor, and it
        is the only way to know rather than guess.
      </p>

      <p>
        Two Coleman Mach notes. Many Mach units have a start capacitor and a start relay next to the run
        capacitor. A start capacitor that fails gives the same hum-and-quit symptom as a bad run capacitor, so
        test both. And if the run capacitor reads within tolerance but the compressor still struggles to start on
        a weak power supply, a hard start kit is a common add-on, but it is a bandage for low voltage, not a fix
        for a failed compressor.
      </p>

      <p>
        If any part of this is beyond you, stop and call a tech. At Agile's rates, that is a $150 service call plus
        labor at $150 per hour, and you still come out hundreds of dollars ahead of a new unit.
      </p>

      <h2 id="replace">When is replacing an RV air conditioner the right call?</h2>

      <p>
        Replace the unit when the compressor has failed, when there is a leak in the sealed refrigerant system,
        when an older unit has had repeat failures, or when the repair estimate is more than half the price of a
        new unit installed. Anything else on the list above is a repair. Here is how to recognize each of the four.
      </p>

      <p>
        <strong>A failed compressor.</strong> The compressor is sealed inside the unit and is not replaced on its
        own on a rooftop RV air conditioner. When it seizes, shorts, or trips its overload every time with good
        voltage and a good capacitor, the unit is done. Make sure the voltage and the capacitor were actually
        tested, because both mimic a bad compressor.
      </p>

      <p>
        <strong>A leak in the sealed refrigerant system.</strong> Rooftop RV units are built as closed, sealed
        systems with no service ports. As one Coleman Mach parts retailer puts it, they are designed as closed and
        sealed systems and ideally should never require recharging, and a low charge means a leak that should be
        handled by a professional (
        <SourceLink label="HVACpartstore" url="https://hvacpartstore.com/blogs/news/recharging-a-coleman-mach-rv-air-conditioner/" />
        ). Under federal rules, anyone who opens the refrigerant circuit, including attaching gauges or adding
        refrigerant, must hold EPA Section 608 certification (
        <SourceLink label="EPA, Section 608 technician certification" url="https://www.epa.gov/section608/section-608-technician-certification-requirements" />
        ). We give no instructions for adding refrigerant here, on purpose. In practice, a tech who finds a leak in
        a rooftop unit will quote you a new unit, because tapping the system, finding the leak, repairing it, and
        recharging costs more than the unit is worth.
      </p>

      <p>
        <strong>An older unit with repeat failures.</strong> A capacitor on a unit that has never given trouble is
        a repair. A capacitor this year, a fan motor last year, and a freeze up problem the year before is a unit
        telling you it is worn out. Each of those parts cost you money and a hot weekend. Add them up before you
        buy the next one.
      </p>

      <p>
        <strong>Repair cost above half the price of a new unit.</strong> Use the table above. If the quote for the
        repair, parts and labor together, is more than half of what a new unit installed would cost you, put the
        money toward the new unit. A fan motor and a control board on the same visit, installed by a tech, can
        cross that line. A capacitor never does.
      </p>

      <h2 id="how-replacement-works">How does an RV air conditioner replacement work?</h2>

      <p>
        The old unit comes off the roof, the new one bolts down over the same square opening on a new gasket,
        and the ceiling assembly and thermostat inside are reconnected or replaced to match. A mobile tech or shop
        does it in one visit. The new unit must match your roof opening, ducted or non-ducted air delivery, and
        your controls.
      </p>

      <p>
        <strong>The roof opening.</strong> Nearly every rooftop RV air conditioner mounts over the standard 14
        inch square opening, the same opening a roof vent uses. Dometic's installation manual calls for a 14 1/4
        inch square opening, within an eighth of an inch, and says the roof needs rafters or support frames on 16
        inch centers to mount the unit properly (
        <SourceLink label="Dometic installation manual" url="https://olivertraveltrailers.com/wp-content/uploads/oliver-university/Component_Manuals/AC_Dometic/DOMETIC-AC-INSTALLATION.pdf" />
        ). That standard is why you can put a Coleman Mach where a Dometic was, or the other way around, as long
        as the rest matches.
      </p>

      <p>
        <strong>Ducted or non-ducted.</strong> A ducted RV has ceiling ducts running to vents around the coach, and
        the air conditioner pushes air into those ducts through a return air box at the opening. A non-ducted RV
        has a ceiling box under the unit with its own vents and controls. The rooftop unit is often the same
        either way. The ceiling assembly is what differs, and it must match how your RV is built. Look at your
        ceiling before you order.
      </p>

      <p>
        <strong>Matching the ceiling assembly and thermostat.</strong> If you stay with the same brand and the
        same control type, you can usually reuse the ceiling assembly and the wall thermostat and only replace the
        rooftop unit, which is the $1,200 to $1,400 part in the table. If you change brands, or move from a
        non-ducted knob box to a wall thermostat, plan on a new ceiling assembly and thermostat with it. That is
        the difference between the low and high ends of the installed cost.
      </p>

      <p>
        <strong>The roof gasket.</strong> A new unit comes with a foam gasket that seals it to the roof. The old
        gasket is never reused. The unit is set on the gasket and pulled down with the ceiling assembly bolts,
        tightened evenly to the compression the manual specifies. Overtightening crushes the gasket and cracks
        the base. Undertightening leaks. This is the step that decides whether your ceiling gets wet next spring.
        If you are reusing a unit or a tech asks you to supply one, Camping World lists a Dometic 14 by 14 inch roof
        gasket kit at $55.14 (
        <SourceLink label="Camping World, roof gasket kit" url="https://www.campingworld.com/roof-gasket-kit-for-rooftop-air-conditioners-and-heat-pumps-14-x-14-15314.html" />
        ).
      </p>

      <p>
        <strong>What a shop or mobile tech does.</strong> They disconnect power, remove the interior ceiling
        assembly, unbolt the old unit, lift it off the roof, clean the roof around the opening, set the new unit
        on its gasket, torque the bolts, connect the power and thermostat wiring at the ceiling, install the
        ceiling assembly, and test it on cool and heat. One retailer's installation guide says a direct
        replacement, swapping the old unit for a new one, typically takes 2 to 3 hours, while a first-time
        installation that needs cutting, wiring, and framing takes longer (
        <SourceLink label="RV AC Unit, cost to install" url="https://www.rvacunit.com/cost-to-install-rv-air-conditioner/" />
        ). A mobile tech does it in your driveway or at the campground. A shop does it on a lift. Either way,
        Coleman Mach's own guidance is that a licensed, trained technician should complete the installation of
        any RV air conditioner (
        <SourceLink label="Airxcel, replacing an RV air conditioner" url="https://blog.airxcel.com/replacing-an-rv-air-conditioner-everything-you-need-to-know/" />
        ). If you need to find one, start with our guide to{" "}
        <Link to="/mobile-rv-tech-near-me">finding a mobile RV tech near you</Link>.
      </p>

      <h2 id="models">What should I know about my specific model?</h2>

      <p>
        The five units below are the rooftop models this guide covers. For each one we list only what a
        manufacturer, a retailer, or a recall record actually documents. Where we could not find a citable
        source for a known failure, we say so instead of repeating forum rumor.
      </p>

      <h3>Dometic Brisk II</h3>

      <p>
        The Brisk II is Dometic's standard profile rooftop unit, and its two stock repair parts are the ones
        this page is about. Retailers sell the 60/5 MFD, 370 volt run capacitor (Dometic 3312195.000) as the
        replacement for the Brisk II family including the B59516 (
        <SourceLink label="Panther RV Products" url="https://pantherrvproducts.com/3312195-000/" />
        ), and the 3315332.005 fan motor as the direct replacement for the B57915 and B59516 (
        <SourceLink label="RV AC Guys" url="https://rvacguys.com/dometic-fan-motor-3315332-005-fits-dometic-brisk-ii-models/" />
        ). Dometic also sells a freeze control sensor for the Brisk and Penguin II models (part 3309191.009), which
        is the part to check on a unit that keeps icing up with clean filters (
        <SourceLink label="High Sky RV Parts" url="https://highskyrvparts.com/rv-parts/appliances/air-conditioners/air-conditioners-replacement-parts/dometic-air-conditioner-freeze-control-sensor-3309191-009" />
        ). One recall to know about: NHTSA recall 17V-620 covered 2017 and 2018 Grand Design Imagine trailers
        whose air conditioner wires could detach from the connector and short circuit, fixed by installing
        positive retention connectors (
        <SourceLink label="NHTSA recall 17V-620 record" url="https://auto-recalls.justia.com/grand-design/imagine/2018/17v620000/index.html" />
        ). Owner forums tie that recall to the Brisk II 15,000 BTU unit, but the recall record itself does not name
        the air conditioner brand. On a Brisk II, the capacitors sit inside the electrical box under the shroud,
        which is held on by four screws (
        <SourceLink label="Micro-Air EasyStart installation guide for Dometic units" url="https://www.micro-air.com/support-documents/installation_resources/EasyStart_364_Installation_Guide_for_Dometic_Family_RV_ACs.pdf" />
        ).
      </p>

      <h3>Dometic Penguin II</h3>

      <p>
        The Penguin II is the low profile Dometic unit. The Dometic 3316230 single zone thermostat with control
        board is listed as compatible with the Penguin II 640310C, 640315C, and 640316C, and it is the part a
        tech installs when an older relay board fails (
        <SourceLink label="Panther RV Products" url="https://pantherrvproducts.com/dmp-969/" />
        ). Elkhart RV Parts sells Penguin II drain kits and a drain pan system made to carry condensation away
        from the roof and the interior (
        <SourceLink label="Elkhart RV Parts" url="https://elkhartrvparts.com/products/dometic-penguin-ii-air-conditioner-drain-kit" />
        ), which tells you water management on this unit is worth checking when you see drips at the ceiling.
        Owners on the iRV2 forum report the freeze sensor falling out of the evaporator coil as a cause of freeze
        ups, and that is an owner report, not a manufacturer statement (
        <SourceLink label="iRV2 owner thread" url="https://www.irv2.com/threads/dometic-a-c-penguin-ii-freezing-up.2082656/" />
        ). We found no recall for the Penguin II.
      </p>

      <h3>Coleman Mach 15</h3>

      <p>
        RV AC Guys, a Coleman Mach parts and service company, says the parts that fail most often on Coleman
        Mach units are the run capacitor, the fan motor, the control board, and the roof compression gasket (
        <SourceLink label="RV AC Guys" url="https://rvacguys.com/coleman-mach-capacitors/" />
        ). Camping World's repair guide adds that the terminal connectors on the outside of the Coleman Mach
        control box can develop light oxidation and lose connectivity, which is worth cleaning before you replace
        anything (
        <SourceLink label="Camping World repair guide" url="https://blog.campingworld.com/learn-to-rv/dometic-coleman-mach-rv-ac-repair-guide/" />
        ). Coleman Mach's own installation instructions warn that any length of ducting reduces evaporator
        airflow and creates the potential for freeze up (
        <SourceLink label="Coleman Mach installation instructions" url="https://library.coleman-mach.com/wp-content/uploads/2023/04/1976A658-3-15.pdf" />
        ), so a ducted Mach 15 that ices up needs its airflow checked first. For a compressor that struggles on
        generator or weak campground power, Coleman Mach sells a hard start kit, part 8333A9021, that adds a
        start capacitor and relay without replacing the run capacitor (
        <SourceLink label="United RV Parts" url="https://unitedrvparts.com/products/coleman-mach-hard-start-kit-8333a9021-capacitor-with-ptcr" />
        ). We found no recall for the Mach 15.
      </p>

      <h3>Coleman Mach 8</h3>

      <p>
        The Mach 8 is Coleman's low profile unit, and its best documented issue is the condenser fan. Units built
        between mid 2014 and mid 2015 with fan hubs numbered 1472B504 or 1472C504 had blades that failed at the
        root, threw the fan out of balance, and broke the motor mounts, and owner forums reported a 1472D504
        replacement fan kit available under warranty (
        <SourceLink label="Forest River Forums owner alert" url="https://www.forestriverforums.com/threads/alert-coleman-mach-8-a-c-fan-failure.223575/" />
        ). The current 1472D504 three blade fan replaces the original six blade fan and the early three blade
        fans (
        <SourceLink label="RV Upgrade Store, fan blade kit" url="https://www.rvupgradestore.com/Coleman-Mach-Replacement-Fan-Blade-Kit-Mach-8-p/41-0054.htm" />
        ). Because the unit is low profile, condensation runs onto the roof unless you add the Coleman Mach
        condensate pump kit, part 47233-309, which has its own manufacturer installation instructions (
        <SourceLink label="Coleman Mach condensate pump instructions" url="https://library.coleman-mach.com/wp-content/uploads/2023/04/1976-681.pdf" />
        ). Coleman Mach also publishes replacement instructions for the Mach 8 motor run capacitors (
        <SourceLink label="Coleman Mach capacitor replacement instructions" url="https://library.coleman-mach.com/wp-content/uploads/2023/04/1976-695.pdf" />
        ). We found no recall for the Mach 8.
      </p>

      <h3>Furrion Chill Cube</h3>

      <p>
        One naming note first. Lippert lists the FACR15SA as the 15.5K Furrion Chill rooftop unit, and the Chill
        Cube as a separate variable speed product line (
        <SourceLink label="Lippert Customer Care Center, air conditioning documents" url="https://support.lci1.com/air-conditioning" />
        ). The best documented problem on Furrion systems is a thermostat one. A Forest River service bulletin
        filed with NHTSA in April 2025 describes a compatibility issue between the Furrion wall thermostat and
        the Furrion control box that causes an E3 error code, with the fix being a Furrion single zone
        thermostat (
        <SourceLink label="NHTSA technical service bulletin MC-11016856" url="https://static.nhtsa.gov/odi/tsbs/2025/MC-11016856-0001.pdf" />
        ). Lippert publishes its own document on correcting the E3 error (
        <SourceLink label="Lippert QR-187" url="https://support.lci1.com/documents/ccd-0008565" />
        ). On water, etrailer's product experts say Furrion units leaking condensation into the RV are either
        clogged drain openings or a damaged roof gasket (
        <SourceLink label="etrailer expert answer" url="https://www.etrailer.com/question-545400.html" />
        ). We found no recall for the Furrion Chill or Chill Cube.
      </p>

      <h2 id="faq">What else do RV owners ask about repairing or replacing an AC?</h2>

      <p>
        The questions below are the ones owners ask once they have been told they need a new air conditioner.
        Each answer stands on its own, and each one points back to the same rule: rule out the cheap parts before
        you pay for the expensive one.
      </p>

      {FAQS.map((f) => (
        <div key={f.q}>
          <h3>{f.q}</h3>
          <p>
            {f.a}
            {f.source && (
              <>
                {" "}(<SourceLink label={f.source.label} url={f.source.url} />)
              </>
            )}
          </p>
        </div>
      ))}

      <TextUsCta location="footer" />

      <p className="text-sm text-gray-600 border-t border-gray-200 pt-4">
        <strong className="text-rv-gray-dark">Michael Wojciak</strong>, founder of FixMyRV.ai. 10 years in the
        RV rental industry. Manages RV appliance repairs across Agile RV Housing placements nationwide.
      </p>
    </BlogPostLayout>
  );
};

export default RvAcRepairOrReplace;
