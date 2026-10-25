# Art licences, provenance and caveats

## Painting reproductions (`public/art/*.jpg`, `public/art/thumbs/*.jpg`)

All ten works are centuries old, and their artists died more than 70 years ago. The bundled files are downscaled copies (max 1600px) of the Wikimedia Commons files below. On **2026-10-25** each file page was checked through the Commons API (`prop=imageinfo&iiprop=extmetadata`), and every one reported `LicenseShortName: Public domain`, `Copyrighted: False`.

| # | Work | Artist, date | Holding institution | Commons source |
|---|---|---|---|---|
| 1 | Mona Lisa | Leonardo da Vinci, c. 1503–1519 | Musée du Louvre, Paris | https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg |
| 2 | The Night Watch | Rembrandt van Rijn, 1642 | Rijksmuseum, Amsterdam | https://commons.wikimedia.org/wiki/File:The_Night_Watch_-_HD.jpg |
| 3 | Girl with a Pearl Earring | Johannes Vermeer, c. 1665 | Mauritshuis, The Hague | https://commons.wikimedia.org/wiki/File:1665_Girl_with_a_Pearl_Earring.jpg |
| 4 | The Great Wave off Kanagawa | Katsushika Hokusai, c. 1831 | Woodblock print (many impressions) | https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg |
| 5 | Water Lilies | Claude Monet, 1906 | Art Institute of Chicago | https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg |
| 6 | The Starry Night | Vincent van Gogh, 1889 | Museum of Modern Art, New York | https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg |
| 7 | A Sunday on La Grande Jatte | Georges Seurat, 1884–1886 | Art Institute of Chicago | https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg |
| 8 | The Garden of Earthly Delights | Hieronymus Bosch, c. 1490–1510 | Museo del Prado, Madrid | https://commons.wikimedia.org/wiki/File:The_Garden_of_earthly_delights.jpg |
| 9 | The Arnolfini Portrait | Jan van Eyck, 1434 | National Gallery, London | https://commons.wikimedia.org/wiki/File:Van_Eyck_-_Arnolfini_Portrait.jpg |
| 10 | The Creation of Adam | Michelangelo, c. 1508–1512 | Sistine Chapel, Vatican City | https://commons.wikimedia.org/wiki/File:Michelangelo_-_Creation_of_Adam_(cropped).jpg |

### Caveats — read before any commercial release
- **Rights review required before selling the game.** Wikimedia Commons treats faithful photographs of 2D public-domain works as public domain (per *Bridgeman v. Corel* and the WMF position). Some jurisdictions and institutions disagree, though, and museum image policies differ. The Vatican Museums in particular restrict commercial use of Sistine Chapel imagery, and some European institutions assert rights in their own photography. Commons may also add a non-copyright restriction notice (personality, trademark, cultural heritage). Free, non-commercial publication of this demo relies on the Commons public-domain status; a paid release should get legal review and, where possible, swap in CC0 open-access files published directly by the institutions (e.g. Rijksmuseum, Art Institute of Chicago, Mauritshuis open-access programmes) or the original stylized fallbacks.
- If an image fails to load, the game draws an **original stylized stand-in** (`FALLBACKS` in `src/art/paintings.ts`) and never shows a broken image.
- Artwork in-game is cropped, zoomed, overlaid with procedural grime and temporarily distorted by the Botch Meter. These are playful game effects only.

## Original art (this project)
The Tiny Restorers, the Grimelings, grime textures, tools, props, particles, icons and all UI are original procedural art written in TypeScript for this project. See `CHARACTER_BIBLE.md`. They are not derived from any third-party character.

## Fonts
- **Fraunces** (variable) — SIL Open Font License 1.1, via `@fontsource-variable/fraunces`.
- **Nunito** (variable) — SIL Open Font License 1.1, via `@fontsource-variable/nunito`.

## Disclaimer
Masterpiece Mayhem is a fantasy. Nothing in it is real-world conservation advice: never scrub, wash, peel, polish or spray a real painting. Leave that to trained conservators.
