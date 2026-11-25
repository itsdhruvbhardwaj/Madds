import {afterEach,describe,it,expect,vi} from "vitest";
import mongoose from "mongoose";
import {HomeSectionConfig} from "../../models/HomeSectionConfig.js";
import {ensureHomeSection} from "./homeCatalog.js";
describe("new Home section placement",()=>{
 afterEach(()=>vi.restoreAllMocks());
 it("appends after the maximum rank even if earlier collections were deleted",async()=>{
  vi.spyOn(mongoose.connection,"readyState","get").mockReturnValue(1);
  vi.spyOn(HomeSectionConfig,"exists").mockResolvedValue(null);
  vi.spyOn(HomeSectionConfig,"findOne").mockReturnValue({sort:()=>({select:()=>({lean:async()=>({order:20})})})} as any);
  vi.spyOn(HomeSectionConfig,"create").mockResolvedValue({} as any);
  await ensureHomeSection("New collection");
  expect(HomeSectionConfig.create).toHaveBeenCalledWith(expect.objectContaining({order:21,visible:false,slug:"New collection"}));
 });
});
