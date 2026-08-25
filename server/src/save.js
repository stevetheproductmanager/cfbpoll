import CfbdData from './models/CfbdData.js';

export async function writeJson(year, slug, data) {
  await CfbdData.findOneAndUpdate(
    { season: Number(year), slug },
    { data, downloadedAt: new Date() },
    { upsert: true }
  );
  return `db:cfbddata/${year}/${slug}`;
}

export async function readJson(year, slug) {
  const doc = await CfbdData.findOne({ season: Number(year), slug });
  return doc?.data || null;
}
