import {beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("../models/AppSettings.js",()=>({AppSettings:{findById:()=>({lean:m.read})}}));
import {getWelcomeCredits,getWelcomeCreditSetting,validWelcomeCredits} from "./welcomeCredits.js";
describe("dynamic welcome credits",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("preserves the previous 100-credit default until configured",async()=>{m.read.mockResolvedValue(null);expect(await getWelcomeCreditSetting()).toMatchObject({welcomeCredits:100,revision:0});});
 it("reads fresh settings for each new signup, including zero",async()=>{m.read.mockResolvedValueOnce({welcomeCredits:20}).mockResolvedValueOnce({welcomeCredits:0});expect(await getWelcomeCredits()).toBe(20);expect(await getWelcomeCredits()).toBe(0);});
 it.each([-1,1.5,"20",100001,null,NaN])("rejects invalid persisted amounts %j",async welcomeCredits=>{expect(validWelcomeCredits(welcomeCredits)).toBe(false);m.read.mockResolvedValue({welcomeCredits});await expect(getWelcomeCredits()).rejects.toThrow("not configured");});
 it("does not expose unneeded stored metadata",async()=>{m.read.mockResolvedValue({welcomeCredits:40,revision:2,internalField:"hidden"});expect(await getWelcomeCreditSetting()).not.toHaveProperty("internalField");});
});
