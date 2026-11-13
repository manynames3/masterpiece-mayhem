/**
 * The Conservator's Notebook: short, true notes on every painting, "look closer" spots, and what real
 * restorers do for each kind of stage.
 *
 * Writing rules (kids read this between levels, so keep it light):
 *  - 2nd-grade English: short sentences (about 12 words or fewer), everyday words.
 *  - A hard word is allowed only with its meaning right next to it ("sfumato means smoky").
 *  - Three facts per painting, three look-closer spots, one sentence per restorer note.
 *  - Only widely documented facts (holding museum and the listed references). Debated ideas say
 *    "some people think". When in doubt, leave it out.
 */
import type { PaintingId } from '../art/paintings';
import type { MechanicType } from '../game/mechanics/params';

export interface Hotspot { x: number; y: number; title: string; text: string }
export interface NotebookPage {
  /** a fun "did you know?" line */
  hook: string;
  medium: string;
  size: string;
  where: string;
  facts: [string, string, string];
  hotspots: Hotspot[];
  /** for grown-ups who want to read more */
  sources: { label: string; url: string }[];
}

const wiki = (title: string) => ({ label: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${title}` });

export const NOTEBOOK: Record<PaintingId, NotebookPage> = {
  'mona-lisa': {
    hook: 'She is much smaller than most people expect!',
    medium: 'Paint on a thin wood board',
    size: 'About as big as a poster',
    where: 'The Louvre museum in Paris, France',
    facts: [
      'She is painted on wood, not cloth.',
      'A thief took her in 1911. She was lost for two years!',
      'Now she lives in a glass box that keeps her safe.',
    ],
    hotspots: [
      { x: 0.45, y: 0.3, title: 'The smile', text: 'Leonardo made the edges soft and smoky. That is why her smile seems to change.' },
      { x: 0.44, y: 0.21, title: 'No eyebrows?', text: 'Look close. She has almost no eyebrows! Some people think they faded away.' },
      { x: 0.12, y: 0.3, title: 'A wobbly world', text: 'The land on the left is lower than the land on the right.' },
    ],
    sources: [{ label: 'Musée du Louvre', url: 'https://www.louvre.fr/en' }, wiki('Mona_Lisa')],
  },
  'night-watch': {
    hook: 'It is not really a night picture!',
    medium: 'Paint on cloth (canvas)',
    size: 'Taller than a basketball hoop',
    where: 'The Rijksmuseum in Amsterdam, the Netherlands',
    facts: [
      'Old shiny coating turned dark and yellow. So people thought it showed the night.',
      'Long ago, people cut off its edges so it would fit on a wall.',
      'Today, helpers fix it inside a glass room. Visitors can watch!',
    ],
    hotspots: [
      { x: 0.47, y: 0.58, title: 'The captain', text: 'The man in black with a red sash is the captain. He is saying, "Let\'s march!"' },
      { x: 0.61, y: 0.64, title: 'A hand shadow', text: 'See the yellow coat? The captain\'s hand makes a shadow on it.' },
      { x: 0.32, y: 0.62, title: 'The glowing girl', text: 'This girl carries a chicken. Its claws were the group\'s special sign.' },
    ],
    sources: [{ label: 'Rijksmuseum', url: 'https://www.rijksmuseum.nl/en' }, wiki('The_Night_Watch')],
  },
  'pearl-earring': {
    hook: 'Nobody knows who she is!',
    medium: 'Paint on cloth (canvas)',
    size: 'About as big as a pillow',
    where: 'The Mauritshuis museum in The Hague, the Netherlands',
    facts: [
      'It is not a portrait of someone famous. It shows a face in a fancy outfit.',
      'Her blue scarf is made from a crushed blue stone. That paint cost a lot!',
      'In 2018, scientists found her tiny eyelashes.',
    ],
    hotspots: [
      { x: 0.62, y: 0.535, title: 'The pearl', text: 'It is just a few gray strokes and two bright dots. There is no hook!' },
      { x: 0.5, y: 0.25, title: 'Super blue', text: 'This blue came from a stone called lapis lazuli. It was very rare.' },
      { x: 0.15, y: 0.3, title: 'A hidden curtain', text: 'The dark wall was once a green curtain. The green faded away.' },
    ],
    sources: [{ label: 'Mauritshuis', url: 'https://www.mauritshuis.nl/en' }, wiki('Girl_with_a_Pearl_Earring')],
  },
  'great-wave': {
    hook: 'There are thousands of copies of this picture!',
    medium: 'A print made with carved wood blocks',
    size: 'A little bigger than a sheet of paper',
    where: 'Many museums have a copy, like the Met in New York',
    facts: [
      'Artists carved one wood block for each color. Then they printed it again and again.',
      'It is one picture in a set about Mount Fuji.',
      'Hokusai was about 70 years old when he made it.',
    ],
    hotspots: [
      { x: 0.42, y: 0.3, title: 'Claw foam', text: 'The white foam looks like little claws. It reaches for the boats!' },
      { x: 0.63, y: 0.69, title: 'Mount Fuji', text: 'This tiny mountain is Mount Fuji. It is the tallest in Japan.' },
      { x: 0.55, y: 0.82, title: 'The boats', text: 'The rowers hold on tight. They are bringing fish to sell.' },
    ],
    sources: [{ label: 'The Met', url: 'https://www.metmuseum.org' }, { label: 'British Museum', url: 'https://www.britishmuseum.org' }, wiki('The_Great_Wave_off_Kanagawa')],
  },
  'water-lilies': {
    hook: 'Monet dug a pond just so he could paint it!',
    medium: 'Paint on cloth (canvas)',
    size: 'About as wide as a door',
    where: 'The Art Institute of Chicago, USA',
    facts: [
      'Monet made a pond in his garden in France. He filled it with water lilies.',
      'He painted his lilies about 250 times!',
      'There is no sky here. You only see the sky in the water.',
    ],
    hotspots: [
      { x: 0.6, y: 0.77, title: 'Quick flowers', text: 'Each pink flower is just a few dabs of paint. Step back and it blooms!' },
      { x: 0.45, y: 0.45, title: 'Upside-down sky', text: 'This blue and white is the sky. The pond works like a mirror.' },
      { x: 0.86, y: 0.95, title: 'His name', text: 'Monet signed his name here, with the year: 1906.' },
    ],
    sources: [{ label: 'Art Institute of Chicago', url: 'https://www.artic.edu' }, wiki('Water_Lilies_(Monet_series)')],
  },
  'starry-night': {
    hook: 'Van Gogh painted this night sky in the daytime!',
    medium: 'Paint on cloth (canvas)',
    size: 'About as big as a TV',
    where: 'MoMA museum in New York, USA',
    facts: [
      'He looked out his window at night. Later he painted it from memory.',
      'The paint is thick and bumpy. You can see every brush stroke.',
      'He was not famous when he was alive. Now everyone knows this painting!',
    ],
    hotspots: [
      { x: 0.45, y: 0.33, title: 'The big swirl', text: 'The sky rolls like ocean waves. It looks windy and alive!' },
      { x: 0.9, y: 0.16, title: 'Moon glow', text: 'A bright moon glows inside a big yellow circle.' },
      { x: 0.2, y: 0.6, title: 'Flame tree', text: 'This dark tree is a cypress. It reaches up like a flame.' },
    ],
    sources: [{ label: 'MoMA', url: 'https://www.moma.org' }, wiki('The_Starry_Night')],
  },
  'grande-jatte': {
    hook: 'This whole painting is made of tiny dots!',
    medium: 'Paint on cloth (canvas)',
    size: 'As big as a wall',
    where: 'The Art Institute of Chicago, USA',
    facts: [
      'Seurat put dots of color side by side. Your eyes mix them together!',
      'It took him about two years to finish.',
      'Some of his yellow paint turned brown as it got old.',
    ],
    hotspots: [
      { x: 0.3, y: 0.8, title: 'Dotty grass', text: 'The grass is green, yellow, orange and blue dots. Step back to see green!' },
      { x: 0.74, y: 0.82, title: 'A pet monkey', text: 'This lady walks a monkey on a leash. Fancy pets were in style.' },
      { x: 0.48, y: 0.12, title: 'Sunny shades', text: 'People used parasols to hide from the sun. How many can you count?' },
    ],
    sources: [{ label: 'Art Institute of Chicago', url: 'https://www.artic.edu' }, wiki('A_Sunday_Afternoon_on_the_Island_of_La_Grande_Jatte')],
  },
  'garden-delights': {
    hook: 'Nobody knows what it means, not even experts!',
    medium: 'Paint on three wood boards',
    size: 'Almost as long as a car',
    where: 'The Prado museum in Madrid, Spain',
    facts: [
      'It has three parts. The two sides fold shut like doors.',
      'When it is shut, the outside is painted all in gray.',
      'The left side is a perfect garden. The right side is dark and spooky!',
    ],
    hotspots: [
      { x: 0.11, y: 0.73, title: 'The first garden', text: 'On the left, Adam and Eve stand in a perfect garden.' },
      { x: 0.47, y: 0.4, title: 'The parade', text: 'People ride horses, camels and more around a pool.' },
      { x: 0.79, y: 0.66, title: 'Spooky music', text: 'On the dark side, giant music makers look scary.' },
    ],
    sources: [{ label: 'Museo del Prado', url: 'https://www.museodelprado.es/en' }, wiki('The_Garden_of_Earthly_Delights')],
  },
  arnolfini: {
    hook: 'The painter wrote, "Jan van Eyck was here!" on the wall.',
    medium: 'Paint on a wood board',
    size: 'About as big as a poster',
    where: 'The National Gallery in London, UK',
    facts: [
      'Above the mirror, the painter wrote his name and the year 1434.',
      'The round mirror shows the whole room, even the door behind us!',
      'He painted thin, see-through layers. That makes things look shiny and real.',
    ],
    hotspots: [
      { x: 0.505, y: 0.29, title: 'Magic mirror', text: 'Look inside! You can see two more people standing in the doorway.' },
      { x: 0.5, y: 0.12, title: 'One candle', text: 'Only one candle is lit, in the daytime. Nobody knows why!' },
      { x: 0.45, y: 0.9, title: 'A fluffy dog', text: 'A little dog stands with the couple. Maybe it was their pet!' },
    ],
    sources: [{ label: 'The National Gallery', url: 'https://www.nationalgallery.org.uk' }, wiki('Arnolfini_Portrait')],
  },
  'creation-of-adam': {
    hook: 'It is painted on a ceiling, way up high!',
    medium: 'Paint on wet plaster (fresco)',
    size: 'Longer than a car',
    where: 'The Sistine Chapel in Vatican City',
    facts: [
      'Michelangelo painted on wet plaster. He had to work fast before it dried!',
      'He did not lie down. He stood up and leaned back to paint above his head.',
      'Helpers cleaned it from 1980 to 1994. Bright colors came back!',
    ],
    hotspots: [
      { x: 0.385, y: 0.45, title: 'Almost touching', text: 'The two fingers do not touch. That tiny gap is very famous!' },
      { x: 0.59, y: 0.23, title: 'Flying in', text: 'God flies in with angels, wrapped in a big red cloak.' },
      { x: 0.2, y: 0.55, title: 'Sleepy Adam', text: 'Adam is relaxed. He is waiting for the spark of life.' },
    ],
    sources: [{ label: 'Vatican Museums', url: 'https://www.museivaticani.va' }, wiki('The_Creation_of_Adam')],
  },
};

/** A real-restorer rule and one short line about it, shown after each stage. */
export interface RestorerNote { principle: string; text: string }

const BY_MECHANIC: Partial<Record<MechanicType, RestorerNote>> = {
  scrub: { principle: 'Test first', text: 'Real restorers clean with tiny cotton swabs. They test a spot smaller than your fingernail first!' },
  critters: { principle: 'Keep it safe', text: 'Museums use sticky traps to catch real bugs before they nibble paintings.' },
  peel: { principle: 'Undo-able', text: 'Restorers take off old yellow coating, then add a new one that can come off later.' },
  crack: { principle: 'Be gentle', text: 'Real restorers leave tiny cracks alone. They only glue paint that is coming loose.' },
  courier: { principle: 'Only fix the hole', text: 'Restorers only paint where paint is missing, never on top of the artist\'s paint.' },
  dots: { principle: 'Only fix the hole', text: 'Some restorers fill holes with tiny lines, so experts can still spot the fix.' },
  beam: { principle: 'Look first', text: 'Restorers shine a special purple light. It shows old fixes that eyes can\'t see.' },
  flow: { principle: 'Keep it safe', text: 'Museums keep the air not too wet and not too dry, so paint won\'t crack.' },
  runner: { principle: 'Travel safe', text: 'When a painting travels, it rides in a padded box, like a tiny car seat.' },
  dispatch: { principle: 'Teamwork', text: 'Restorers work with scientists who look at tiny paint bits under a microscope.' },
  bridge: { principle: 'Hold it up', text: 'Old, weak paintings can get a new cloth on the back to hold them up.' },
  boss: { principle: 'Keep it safe', text: 'Mold loves damp air. Museums keep the air dry so mold can\'t grow.' },
  touch: { principle: 'Be gentle', text: 'Restorers touch paintings as little as they can, with very soft hands.' },
  composite: { principle: 'Write it down', text: 'Restorers take photos of every step, so future helpers know what was done.' },
};

/** Stage-specific notes where the painting's real story fits the stage. */
const BY_STAGE: Record<number, RestorerNote> = {
  4: { principle: 'Undo-able', text: 'The Night Watch\'s old yellow coating made it look like night. Helpers clean it a tiny bit at a time.' },
  6: { principle: 'Teamwork', text: 'Since 2019, people can watch helpers study the real Night Watch through a glass wall!' },
  28: { principle: 'Be gentle', text: 'Helpers cleaned soot off this ceiling, but left Michelangelo\'s paint alone.' },
};

export function restorerNote(stageId: number, mechanic: MechanicType): RestorerNote {
  return BY_STAGE[stageId] ?? BY_MECHANIC[mechanic] ?? BY_MECHANIC.composite!;
}
