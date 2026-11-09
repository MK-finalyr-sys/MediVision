import rawMedicines from "@/data/medicines.json";
import rawTips from "@/data/tips.json";
import { medicineSchema, tipSchema } from "./contracts";
export const medicines = medicineSchema.array().length(40).parse(rawMedicines);
export const tips = tipSchema.array().parse(rawTips);
