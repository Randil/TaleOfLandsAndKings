export const OCEAN_REGION_NAMES: string[] = [
  // 1–20
  "Stormbight", "Greysound", "Irondeep", "Ashbrine", "Frostnarrows",
  "Goldenwaters", "Shadowbight", "Dawnsound", "Crystaldeep", "Mistchannel",
  "Embertide", "Coldstrait", "Duskchannel", "Ravendeep", "Silverwave",
  "Grimdeep", "Wychdrift", "Blackabyss", "Stonebight", "Fernsound",

  // 21–40
  "Coppertide", "Mistdeep", "Sungulf", "Frostsound", "Cinderbrine",
  "Bramblestrait", "Saltsound", "Dustdeep", "Goldgulf", "Dawntide",
  "Shadowsound", "Cragdeep", "Willowstrait", "Stormdeep", "Ashsound",
  "Emberbight", "Coldwave", "Duskbight", "Ravensound", "Crystalnarrows",

  // 41–60
  "Silversound", "Grimstrait", "Wychdeep", "Blacksound", "Stonenarrows",
  "Ferndeep", "Copperbight", "Mistsound", "Sundeep", "Frostbight",
  "Cinderdeep", "Bramblebight", "Saltbrine", "Dustchannel", "Goldtide",
  "Dawnchannel", "Shadowdeep", "Cragnarrows", "Willowsound", "Stormnarrows",

  // 61–80
  "Ashdeep", "Embersound", "Coldchannel", "Duskdeep", "Ravenwave",
  "Crystalsound", "Silverdeep", "Grimsound", "Wychbight", "Blacknarrows",
  "Stonechannel", "Fernbight", "Coppersound", "Mistnarrows", "Suntide",
  "Frostdeep", "Cinderwave", "Bramblesound", "Saltstrait", "Dustwave",

  // 81–100
  "Golddeep", "Dawnstrait", "Shadowwave", "Cragwave", "Willowdeep",
  "Stormwave", "Ashwave", "Emberchannel", "Colddeep", "Duskwave",
  "Ravenbight", "Crystalbight", "Silvernarrows", "Grimwave", "Wychsound",
  "Blackchannel", "Stonesound", "Fernwave", "Copperdeep", "Ashgulf",
];

export function getOceanRegionName(index: number): string {
  const cycle = Math.floor(index / OCEAN_REGION_NAMES.length);
  const name = OCEAN_REGION_NAMES[index % OCEAN_REGION_NAMES.length];
  return cycle === 0 ? name : `${name} ${cycle + 1}`;
}
