// LiteLoader-AIDS automatic generated
/// <reference path="c:\Users\yqs11\Desktop\Projects\Game\Minecraft\LLSE-Aids-Library/dts/helperlib/src/index.d.ts"/> 


const _VER = [1, 0, 2];

import { 
    _I18N_DIR,
    InitGlobalVars,
    SUCCESS
} from "./plugins/LLSE-FakePlayer/Utils/GlobalVars.js";

import { GlobalConf, InitConfigFile } from "./plugins/LLSE-FakePlayer/Utils/ConfigFileHelper.js";
import { PermManager } from "./plugins/LLSE-FakePlayer/Utils/PermManager.js";
import { ExportFakePlayerAPIs, FakePlayerManager } from "./plugins/LLSE-FakePlayer/FpManager/FakePlayerManager.js";
import { RegisterCmd } from "./plugins/LLSE-FakePlayer/Command/CommandRegistry.js";

function main()
{
    i18n.load(_I18N_DIR);
    InitGlobalVars();

    ll.registerPlugin(
        /* name */ "LLSE-FakePlayer",
        /* introduction */ "A strong fake-player plugin for LiteLoaderBDS",
        /* version */ _VER,
        /* otherInformation */ {"Author": "yqs112358"}
    ); 

    InitConfigFile();
    ExportFakePlayerAPIs();

    logger.setLogLevel(GlobalConf.get("LogLevel", 4));
    PermManager.initPermManager();
    logger.info(i18n.tr("main.welcome", _VER));

    FakePlayerManager.loadAllFpData();
    //logger.debug("FpList: ", FakePlayerManager.fpList);

    mc.listen("onTick", FakePlayerManager.onTick);
    mc.listen("onPlayerDie", FakePlayerManager.onPlayerDie);
    mc.listen("onServerStarted", () =>
    {
        // command registry
        RegisterCmd(PermManager.userMode);

        // auto reconnect
        let res = FakePlayerManager.initialAutoOnline();
        if(res != SUCCESS)
        {
            logger.warn(i18n.tr("main.autoreconnect.error") + "\n" + res);
        }
    });
}

main();