export const REGION_NAMES: string[] = [
  // 1–50
  "Ashenvale", "Ironmere", "Duskhollow", "Embervast", "Coldfen",
  "Stormreach", "Greymoor", "Thornwall", "Dunhallow", "Ashenford",
  "Ravenspire", "Crystalbrook", "Silverwood", "Grimhaven", "Wychwood",
  "Blackmarsh", "Stonecrest", "Fernholt", "Coppergate", "Mistfall",
  "Sundermere", "Frostholm", "Aldenmoor", "Cinderkeep", "Hollowfen",
  "Brambleshire", "Saltmere", "Thorndale", "Dusthaven", "Goldmoor",
  "Ironvale", "Dawnmere", "Shadowfen", "Cragmoor", "Willowmere",
  "Stormfell", "Ashwick", "Embermere", "Coldvast", "Duskmoor",
  "Ravenmere", "Crystalfen", "Silvercrest", "Grimwood", "Wychfen",
  "Blackwater", "Stonehollow", "Fernmere", "Copperholm", "Mistmoor",

  // 51–100
  "Foxhollow", "Wolfmere", "Bearwood", "Hartfen", "Swanmere",
  "Cranefen", "Mosswick", "Heathfen", "Bogmoor", "Wildwood",
  "Windmoor", "Wintervale", "Crowdale", "Elkwood", "Otterfen",
  "Hawkspire", "Heronmere", "Deerholm", "Houndmere", "Yarrowdale",
  "Elderfen", "Pinefen", "Rosewood", "Ivymere", "Clovermoor",
  "Yewhollow", "Mossmere", "Heathwood", "Bogfen", "Wildmere",
  "Windfen", "Wintermoor", "Worndale", "Crowmere", "Foxfen",
  "Wolfdale", "Bearmoor", "Hartmere", "Swanwood", "Craneholm",
  "Mossholm", "Houndfen", "Elkfen", "Ottermere", "Hawkfen",
  "Heronfell", "Deerfen", "Yarrowmoor", "Elderdale", "Pinewood",

  // 101–150
  "Brighthollow", "Gloomfen", "Darkwood", "Palefen", "Fairvale",
  "Hazewood", "Dimmoor", "Clearfen", "Brightmere", "Gloomvale",
  "Moonfen", "Morningmere", "Gloamhollow", "Highwood", "Gloamfen",
  "Emberthorn", "Coldthorn", "Duskthorn", "Raventhorn", "Crystalthorn",
  "Silverthorn", "Grimthorn", "Wychthorn", "Stonethorn", "Fernthorn",
  "Copperthorn", "Mistthorn", "Sunthorn", "Frostthorn", "Cinderthorn",
  "Bramblethorn", "Saltthorn", "Dustthorn", "Goldthorn", "Dawnthorn",
  "Shadowthorn", "Cragthorn", "Willowthorn", "Stormthorn", "Ashthorn",
  "Embervale", "Coldmoor", "Greyfen", "Thornmere", "Dunmoor",
  "Ashenmere", "Ravendale", "Crystalvale", "Silverdale", "Grimdale",

  // 151–200
  "Shalefen", "Runedale", "Jadewood", "Ambervale", "Slatecrest",
  "Flintmoor", "Chalkfen", "Granitedale", "Marblewood", "Quartzfen",
  "Onyxmere", "Garnetvale", "Pearlmoor", "Coralfen", "Ironhollow",
  "Wychdale", "Blackfen", "Stonefen", "Fernvale", "Coppervale",
  "Mistdale", "Sunmoor", "Frostvale", "Cinderfen", "Cinderdale",
  "Blackvale", "Stonedale", "Ferndale", "Copperfen", "Emberfell",
  "Coldwood", "Duskwood", "Ravenfell", "Crystalfell", "Silverfell",
  "Grimfell", "Wychfell", "Blackfell", "Stonefell", "Fernfell",
  "Copperfell", "Mistvale", "Sunvale", "Frostdale", "Cinderholm",
  "Bramblefen", "Saltfen", "Dustfen", "Goldvale", "Dawnwood",

  // 201–250
  "Embershard", "Coldshard", "Duskshard", "Ravenshard", "Crystalshard",
  "Silvershard", "Grimshard", "Wychshard", "Blackshard", "Stoneshard",
  "Fernshard", "Coppershard", "Mistshard", "Sunshard", "Frostshard",
  "Cindershard", "Brambleshard", "Saltshard", "Dustshard", "Goldshard",
  "Dawnshard", "Shadowshard", "Cragshard", "Willowshard", "Stormshard",
  "Emberbriar", "Coldbriar", "Duskbriar", "Ravenbriar", "Crystalbriar",
  "Silverbriar", "Grimbriar", "Wychbriar", "Blackbriar", "Stonebriar",
  "Fernbriar", "Copperbriar", "Mistbriar", "Sunbriar", "Frostbriar",
  "Cinderbriar", "Saltbriar", "Dustbriar", "Goldbriar", "Dawnbriar",
  "Shadowbriar", "Cragbriar", "Willowbriar", "Stormbriar", "Ashbriar",

  // 251–300
  "Embermire", "Coldmire", "Duskmire", "Ravenmire", "Crystalmire",
  "Silvermire", "Grimmire", "Wychmire", "Blackmire", "Stonemire",
  "Fernmire", "Coppermire", "Mistmire", "Sunmire", "Frostmire",
  "Cindermire", "Bramblemire", "Saltmire", "Dustmire", "Goldmire",
  "Dawnmire", "Shadowmire", "Cragmire", "Willowmire", "Stormmire",
  "Emberwold", "Coldwold", "Duskwold", "Ravenwold", "Crystalwold",
  "Silverwold", "Grimwold", "Wychwold", "Blackwold", "Stonewold",
  "Fernwold", "Copperwold", "Mistwold", "Sunwold", "Frostwold",
  "Cinderwold", "Bramblewold", "Saltwold", "Dustwold", "Goldwold",
  "Dawnwold", "Shadowwold", "Cragwold", "Willowwold", "Stormwold",
];

export function getRegionName(index: number): string {
  const cycle = Math.floor(index / REGION_NAMES.length);
  const name = REGION_NAMES[index % REGION_NAMES.length];
  return cycle === 0 ? name : `${name} ${cycle + 1}`;
}
