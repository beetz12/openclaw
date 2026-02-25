import { getDb } from "../db";
import { seedContentSample } from "./services/dev-seed";

const result = seedContentSample(getDb());
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
