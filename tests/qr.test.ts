import {it,expect} from "vitest";
import sharp from "sharp";
import jsQR from "jsqr";
it("the delivered QR PNG decodes to the real HTTPS preview, with no private records",async()=>{
 const {data,info}=await sharp("public/medivision-qr.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const result=jsQR(new Uint8ClampedArray(data),info.width,info.height);
 expect(result?.data).toBe("https://3000-i43ciffuh3pvohzuafdza.e2b.app/");
 expect(new URL(result!.data).protocol).toBe("https:");
 expect(new URL(result!.data).search).toBe("");
});
