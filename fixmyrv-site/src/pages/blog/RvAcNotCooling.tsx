import { Link } from "react-router-dom";
import BlogPostLayout from "@/components/blog/BlogPostLayout";
import { getPostBySlug } from "@/data/blogPosts";

const RvAcNotCooling = () => {
  const post = getPostBySlug("rv-ac-not-cooling");

  if (!post) {
    return null;
  }

  return (
    <BlogPostLayout post={post}>
      <p>
        An RV air conditioner that runs but does not cool is the number one summer complaint we hear. The compressor hums, air moves, but the output is barely cooler than the ambient temperature. Most of the time the cause is one of five things, and three of them you can fix yourself in under an hour. This guide covers rooftop units from Dometic and Coleman Mach, which account for the vast majority of RV installations.
      </p>

      <h2>Set Your Expectations First</h2>

      <p>
        Before diagnosing, know what a healthy RV AC can actually do. A rooftop unit in good condition delivers air roughly 16 to 22 degrees Fahrenheit cooler than the intake air. On a 95 degree day, 75 degree output air is normal operation, not a failure. Measure the temperature difference between the intake grille and the cold air output with a simple thermometer. If the split is 16 degrees or more, your AC is working and the problem is heat load: too much sun, poor insulation, or a unit undersized for the rig. If the split is under 16 degrees, keep reading.
      </p>

      <h2>Check the Simple Things First</h2>

      <h3>Dirty Air Filter and Coils</h3>

      <p>
        Pull the interior grille and check the return air filter. A clogged filter chokes airflow and tanks cooling performance. Wash or replace it. While the grille is off, look at the evaporator coils behind it. If they are matted with dust and pet hair, cooling capacity drops dramatically. Clean them gently with coil cleaner and a soft brush. Then get on the roof, remove the shroud, and inspect the condenser coils at the back of the unit. Road grime and cottonwood fluff block the condenser's ability to shed heat. Rinse from the inside out with low pressure water.
      </p>

      <h3>Freeze Up</h3>

      <p>
        If the AC cools well for an hour or two and then the airflow drops to nearly nothing, the evaporator is probably freezing into a block of ice. Shut the unit off, run the fan only, and look for water dripping as it thaws. Freeze ups come from low airflow (dirty filter), running the thermostat too cold in humid weather, or low refrigerant. Fix the airflow first. If the freeze ups continue with a clean filter and reasonable thermostat settings, the refrigerant charge is suspect, and rooftop units are sealed systems that cannot be recharged. That is a replacement conversation.
      </p>

      <h2>Power Problems</h2>

      <p>
        RV air conditioners need a lot of power on startup. If your unit tries to start, clicks, and hums without the compressor kicking in, check your power source first. Running on a 15 amp household cord, a weak campground pedestal, or an undersized generator will brown out the compressor. Voltage below 108V at the unit during startup can prevent the compressor from starting at all and will eventually damage it. A plug in voltage meter at an interior outlet tells you what the unit is seeing.
      </p>

      <h2>The Failed Capacitor</h2>

      <p>
        If power is good and the compressor still hums without starting, the start capacitor is the most likely culprit. This is the most common hard part failure on RV air conditioners. Capacitors are cheap and replacement is straightforward for anyone comfortable working with electrical components, with one critical warning: capacitors store a charge even when power is disconnected, and they must be safely discharged before handling. If you are not comfortable with that step, this is a technician job. The part costs a fraction of what a new unit does, so do not let anyone talk you into replacing the whole AC over a capacitor.
      </p>

      <h2>When It Is Actually the Compressor</h2>

      <p>
        A compressor that has failed internally will either not run at all or run without moving refrigerant. If the capacitor tests good, voltage is healthy, coils are clean, and the unit still will not produce a temperature split, the compressor or the sealed refrigerant circuit has failed. Rooftop RV units are not economically repairable at that point. Replacement is the answer, and prices vary widely by model and season, so shop before summer if you can. Before you buy, read our guide on{" "}
        <Link to="/blog/rv-ac-repair-or-replace">whether to repair or replace an RV air conditioner</Link>. It
        lays out real repair and replacement costs, how to test the capacitor yourself, and the four situations
        where a new unit is the right call.
      </p>

      <h2>Get Instant Help With Your AC</h2>

      <p>
        Every rig and every failure is a little different. Text FixMyRV.ai with your RV year, make, model, and AC brand, and tell us what you are seeing. Our diagnostic service, backed by over 50,000 pages of professional repair manuals, will walk you through the exact sequence for your unit and tell you honestly whether it is a DIY fix or a technician visit.
      </p>
    </BlogPostLayout>
  );
};

export default RvAcNotCooling;
