export const CITY_NAMES: string[] = [
  // 1–50
  "Aldenmoor", "Brightholm", "Irongate", "Stonekeep", "Riverford",
  "Millhaven", "Oakdale", "Ashwick", "Fernbrook", "Goldcrest",
  "Silverport", "Copperton", "Ironwood", "Steelbridge", "Coalford",
  "Saltwick", "Whitewall", "Blackthorn", "Greystone", "Redcliff",
  "Highwatch", "Lowfield", "Deepholm", "Tallspire", "Fairhaven",
  "Darkwater", "Clearbrook", "Coldridge", "Warmshore", "Dryford",
  "Wetmoor", "Windgate", "Stormwall", "Calmhaven", "Sunfield",
  "Moonwick", "Starport", "Dawnholm", "Duskbridge", "Nightgate",
  "Oakenshield", "Elmbridge", "Ashford", "Birchwick", "Willowmere",
  "Pinecrest", "Cedarholm", "Maplewood", "Walnutford", "Chestnuthaven",
  // 51–100
  "Aldenvale", "Brindlemoor", "Caerthwall", "Dunhollow", "Edgecliff",
  "Frostwick", "Grimshore", "Heathmont", "Ironton", "Jarlsberg",
  "Keldmoor", "Larchwood", "Merriford", "Northgate", "Oakhaven",
  "Pebbleton", "Queensport", "Ravenwall", "Stonemarsh", "Thistledown",
  "Underholm", "Valewatch", "Westbridge", "Yarrowmere", "Amberwick",
  "Barleymoor", "Coppergate", "Daleford", "Elmhaven", "Fallowmere",
  "Gloomwick", "Harrowmoor", "Iceford", "Jadewall", "Knollgate",
  "Lochbridge", "Mudwick", "Newhollow", "Overwatch", "Pinhollow",
  "Quillmoor", "Redwick", "Saltmarsh", "Tumblestone", "Undergate",
  "Windhollow", "Yarrowford", "Aldgate", "Blackmoor", "Cobbleton",
  // 101–150
  "Aethermoor", "Bleakhollow", "Crowngate", "Dreadwick", "Eversong",
  "Fableford", "Ghostholm", "Highhollow", "Ironmere", "Jadefield",
  "Keenwatch", "Lostmoor", "Mistbridge", "Nightholm", "Pridewick",
  "Quietmere", "Ruingate", "Shadowford", "Thornwick", "Umbraholm",
  "Wandermoor", "Ambervale", "Blazegate", "Crimsonton", "Dustwick",
  "Emberford", "Frostholm", "Gildengate", "Hallowmere", "Icehollow",
  "Jadehollow", "Knightwatch", "Lorebridge", "Mythford", "Omenholm",
  "Pilgrimwick", "Questmoor", "Ridgegate", "Sageford", "Timberholm",
  "Vergemark", "Wyrmgate", "Arkendale", "Bramblewood", "Cindervale",
  "Dovehollow", "Eastwatch", "Ferngate", "Groveholm", "Hillcrest",
  // 151–200
  "Inlethaven", "Jetwick", "Kingsfold", "Lowgate", "Marshford",
  "Northhollow", "Oldwick", "Proudgate", "Quickford", "Southmere",
  "Tridentport", "Underwood", "Valleygate", "Westholm", "Yardale",
  "Alderwick", "Battleford", "Copperholm", "Dunwich", "Eldergate",
  "Fernhollow", "Greywood", "Harrowgate", "Ironhollow", "Jadeton",
  "Knollbrook", "Larchgate", "Millwick", "Newbridge", "Oakgate",
  "Plumwick", "Quickholm", "Rustgate", "Saltholm", "Thorndale",
  "Upperwick", "Vaultmere", "Wellgate", "Yewdale", "Ashenmoor",
  "Bouldergate", "Coalhaven", "Darkthorn", "Eaglewatch", "Falconmere",
  "Greyhollow", "Helmsford", "Inkwick", "Jadegate", "Keenholm",
  // 201–250
  "Lambwick", "Millmoor", "Noblegate", "Portgate", "Quarryford",
  "Rookmere", "Silverdale", "Tidehollow", "Umberton", "Verdantholm",
  "Whispergate", "Yarborough", "Deepwick", "Elfmoor", "Foxgate",
  "Gildenmere", "Havenwick", "Jewelton", "Keystoneholm", "Longwick",
  "Midmoor", "Nettleford", "Oakmoor", "Plovergate", "Quillbridge",
  "Reedmere", "Siltwick", "Wellmoor", "Ambergate", "Brimwick",
  "Cliffholm", "Dovegate", "Estmoor", "Froghaven", "Gloamwick",
  "Ivorymere", "Jasperton", "Limewick", "Marshgate", "Northmere",
  "Orbgate", "Peakholm", "Qualwick", "Rivergate", "Stonewick",
  "Thornholm", "Villemere", "Watermoor", "Yorewick", "Ashpool",
  // 251–300
  "Bledwick", "Cairnholm", "Drakemoor", "Edenwold", "Falkbridge",
  "Grimport", "Hawkwatch", "Icemere", "Jarlsmoor", "Kelwick",
  "Loregate", "Mudholm", "Norngate", "Owlwatch", "Peatmoor",
  "Queensholm", "Ridgewick", "Silvermoor", "Tidewick", "Umbergate",
  "Vexholm", "Wolfwatch", "Xenport", "Yewholm", "Zealford",
  "Anvilgate", "Bonmere", "Castlewick", "Dustholm", "Emberglow",
  "Frostgate", "Graywick", "Hillholm", "Ironvale", "Jadewick",
  "Kingate", "Lanternwick", "Moonshard", "Nightvale", "Oldmoor",
  "Prismgate", "Questholm", "Rampart", "Stonegate", "Thornmere",
  "Undervale", "Vaultwick", "Westmere", "Wolfmere", "Zorwick",
];

export function getCityName(index: number): string {
  const cycle = Math.floor(index / CITY_NAMES.length);
  const name = CITY_NAMES[index % CITY_NAMES.length];
  return cycle === 0 ? name : `${name} ${cycle + 1}`;
}
