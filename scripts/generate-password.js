// Generates an APP_PASSWORD (three random words + a number) and a SESSION_SECRET
// for signing session cookies. Run with: node scripts/generate-password.js
import { randomInt, randomBytes } from "node:crypto";

const WORDS = [
  "alpha", "amber", "anchor", "apple", "arrow", "aspen", "autumn", "badger", "banjo", "basil",
  "beacon", "beetle", "birch", "bishop", "blanket", "bloom", "boulder", "breeze", "bridge", "bronze",
  "canyon", "cedar", "cinder", "clover", "cobalt", "comet", "copper", "coral", "cotton", "cradle",
  "crimson", "crystal", "dawn", "delta", "denim", "desert", "dolphin", "dragon", "dune", "eagle",
  "ember", "falcon", "feather", "fennel", "fern", "fiddle", "flint", "forest", "fossil", "garnet",
  "gecko", "ginger", "glacier", "granite", "gravel", "harbor", "hazel", "hearth", "heron", "hickory",
  "hollow", "honey", "hornet", "indigo", "ivory", "jade", "jasper", "jungle", "juniper", "kestrel",
  "lagoon", "lantern", "larch", "lattice", "lavender", "lemon", "lentil", "lichen", "linen", "lotus",
  "lumen", "lynx", "magnet", "mango", "maple", "marble", "marsh", "meadow", "mesa", "mica",
  "mint", "mirror", "mist", "moss", "nectar", "nettle", "nickel", "nimbus", "nutmeg", "oak",
  "oasis", "obsidian", "ochre", "olive", "onyx", "opal", "orchid", "otter", "oyster", "paisley",
  "panther", "papaya", "parsley", "pebble", "pecan", "pepper", "petal", "pewter", "pigeon", "pine",
  "plum", "poppy", "prairie", "prism", "quail", "quartz", "quiver", "rabbit", "raven", "reed",
  "ridge", "ripple", "river", "robin", "saffron", "sage", "salmon", "sandpiper", "sapphire", "satin",
  "sequoia", "shale", "silo", "sparrow", "spice", "spruce", "starling", "sunset", "swallow", "tangerine",
  "tarragon", "thistle", "thyme", "timber", "topaz", "tortoise", "tundra", "turquoise", "umber", "valley",
  "velvet", "vermillion", "violet", "walnut", "warbler", "wattle", "whisker", "willow", "wisteria", "wren",
  "yarrow", "zephyr", "zinc",
];

function pickWords(count) {
  const chosen = new Set();
  while (chosen.size < count) {
    chosen.add(WORDS[randomInt(0, WORDS.length)]);
  }
  return [...chosen];
}

const password = `${pickWords(3).join("-")}-${randomInt(1000, 10000)}`;
const sessionSecret = randomBytes(32).toString("hex");

console.log(`APP_PASSWORD=${password}`);
console.log(`SESSION_SECRET=${sessionSecret}`);
console.log("\nAdd both lines to .env (local) and to your Vercel project's Environment Variables (deployed).");
