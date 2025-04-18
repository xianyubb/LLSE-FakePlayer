import { AllFpListSoftEnum, OnlineFpListSoftEnum, OfflineFpListSoftEnum } from "../Command/CommandRegistry"
import { FakePlayerInst } from "./FakePlayerInst"
import { CalcPosFromViewDirection, EntityGetFeetPos } from "../Utils/Utils"
import {
    _FP_DATA_DIR, _FP_INVENTORY_DIR, _DEFAULT_PLAYER_SELECT_SLOT, _LONG_OPERATIONS_LIST,
    SUCCESS
} from "../Utils/GlobalVars"
import { PermManager } from "../Utils/PermManager"
import { GlobalConf } from "../Utils/ConfigFileHelper"

export class FakePlayerManager {
    /////////////////////////////////////////////////////////////////////////////////////
    ///                                  Private Data                                 ///
    /////////////////////////////////////////////////////////////////////////////////////

    static fpListObj = {};
    static needTickFpListObj = {}



    /////////////////////////////////////////////////////////////////////////////////////
    ///                                 Help Functions                                ///
    /////////////////////////////////////////////////////////////////////////////////////

    // return Player / null
    static getPlayer(fpName) {
        FakePlayerManager.forEachFp((name, fp) => {
            if (name == fpName)
                return fp.getPlayer()
        })
        return null
    }

    // return FpInstance / undefined
    static getFpInstance(fpName) {
        return FakePlayerManager.fpListObj[fpName]
    }

    // callback(fpName, fpInst);
    static forEachFp(callback) {
        for (let fpName in FakePlayerManager.fpListObj)
            callback(fpName, FakePlayerManager.fpListObj[fpName])
    }


    /////////////////////////////////////////////////////////////////////////////////////
    ///                                 Public Logic                                 ///
    /////////////////////////////////////////////////////////////////////////////////////

    static onTick() {
        for (let key in FakePlayerManager.needTickFpListObj) {
            FakePlayerManager.needTickFpListObj[key].tickLoop()
        }
    }

    static onPlayerDie(player, source) {
        if (!player)
            return
        let fpName = player.realName
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return
        if (!fp.isOnline()) {
            // unexpected, just ignore it
            return
        }

        // Process short-time counter
        if (GlobalConf.get("AutoOfflineWhenFrequentDeath", 1)) {
            if (fp.plusAndCheckDeathCounter()) {
                // Too frequent death, auto offline
                FakePlayerManager.offline(fpName)
                mc.broadcast("§e[FakePlayer] " + i18n.tr("fpManager.frequentDeath.autoOffline", fpName, 20) + "§r")
                logger.warn(i18n.tr("fpManager.frequentDeath.autoOffline", fpName, 20))
                return
            }
        }

        logger.warn(`[FakePlayer] ` + i18n.tr("fpManager.consoleLog.respawning", fpName))
        if (!fp.offline(false))
            logger.warn(`[FakePlayer] ` + i18n.tr("fpManager.consoleLog.error.failToRecreate", fpName))
        else {
            setTimeout(() => {
                if (!fp.online())
                    logger.warn(`[FakePlayer] ` + i18n.tr("fpManager.consoleLog.error.failToRespawn", fpName))
                else
                    logger.warn(`[FakePlayer] ` + i18n.tr("fpManager.consoleLog.respawned", fpName))
            }, 500)
        }
    }

    static initialAutoOnline() {
        let resultStr = ""

        // if fp is online at shutdown, recover him
        FakePlayerManager.forEachFp((fpName, fp) => {
            if (fp.isOnline()) {
                let res = FakePlayerManager.online(fpName, false)
                if (res != SUCCESS)
                    resultStr += res + "\n"
            }
        })
        return resultStr == "" ? SUCCESS : resultStr.substring(0, resultStr.length - 1)
    }



    /////////////////////////////////////////////////////////////////////////////////////
    ///                                Fp Data Storage                                ///
    /////////////////////////////////////////////////////////////////////////////////////

    // return true / false
    static saveFpData(fpName, updateData = true) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (updateData) {
            fp.updatePos()
            fp.updateDirection()
            fp.updateGameMode()
        }
        File.writeTo(_FP_DATA_DIR + `${fpName}.json`, JSON.stringify(fp.serializeFpData(), null, 4))
        return true
    }

    // return true / false
    static deleteFpData(fpName) {
        return File.delete(_FP_DATA_DIR + `${fpName}.json`)
    }

    // return true / false
    static loadAllFpData() {
        if (!File.exists(_FP_DATA_DIR)) {
            File.mkdir(_FP_DATA_DIR)
            return true
        }
        else {
            let fileNamesArr = File.getFilesList(_FP_DATA_DIR)
            for (let fileName of fileNamesArr) {
                let path = _FP_DATA_DIR + fileName
                if (File.checkIsDir(path) || !fileName.endsWith(".json"))
                    continue
                let fpName = fileName.substring(0, fileName.length - 5)    // remove .json

                let jsonStr = File.readFrom(path)
                if (jsonStr.length == 0 || jsonStr == "{}")
                    continue

                let fpData = null
                try {
                    fpData = JSON.parse(jsonStr)
                    // logger.debug(`${fpName}'s FpData: `, fpData);
                    if (!(fpData instanceof Object))
                        return false
                    FakePlayerManager.fpListObj[fpName] = FakePlayerInst.recoverFpData(fpName, fpData)
                    FakePlayerManager.saveFpData(fpName, false)
                }
                catch (err) {
                    logger.error(`Error when parsing fakeplayer ${fpName}'s data record: ` + err)
                    return false
                }
            }
            return true
        }
    }



    /////////////////////////////////////////////////////////////////////////////////////
    ///                             Fp Inventory Storage                              ///
    /////////////////////////////////////////////////////////////////////////////////////

    // return true / false
    static saveInventoryData(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return false
        if (!fp.getPlayer())
            return false

        let inventoryStr = fp.serializeAllItems()
        // logger.debug(inventoryStr);
        if (!File.exists(_FP_INVENTORY_DIR))
            File.mkdir(_FP_INVENTORY_DIR)
        return File.writeTo(_FP_INVENTORY_DIR + `${fpName}.snbt`, inventoryStr)
    }

    // return true / false
    static loadInventoryData(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return false
        if (!fp.getPlayer())
            return false

        if (!File.exists(_FP_INVENTORY_DIR)) {
            File.mkdir(_FP_INVENTORY_DIR)
            return false
        }
        let snbtStr = File.readFrom(_FP_INVENTORY_DIR + `${fpName}.snbt`)
        if (!snbtStr)
            return false
        return fp.recoverAllItems(snbtStr)
    }

    // return true / false
    static deleteInventoryData(fpName) {
        return File.delete(_FP_INVENTORY_DIR + `${fpName}.snbt`)
    }



    /////////////////////////////////////////////////////////////////////////////////////
    ///                               Public Functions                                ///
    /////////////////////////////////////////////////////////////////////////////////////

    static online(fpName, failIfOnline = true) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (failIfOnline && fp.isOnline())
            return i18n.tr("fpManager.resultText.online.success", fpName)

        if (!fp.online())
            return i18n.tr("fpManager.resultText.online.fail", fpName)

        if (fp.isNeedTick())
            FakePlayerManager.needTickFpListObj[fpName] = fp
        FakePlayerManager.saveFpData(fpName, false)
        FakePlayerManager.loadInventoryData(fpName)

        OfflineFpListSoftEnum.remove(fpName)
        if (!OnlineFpListSoftEnum.exists(fpName))
            OnlineFpListSoftEnum.add(fpName)
        return SUCCESS
    }

    static offline(fpName, failIfOffline = true) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (failIfOffline && !fp.isOnline())
            return i18n.tr("fpManager.resultText.offline.success", fpName)

        if (fpName in FakePlayerManager.needTickFpListObj)
            delete FakePlayerManager.needTickFpListObj[fpName]
        if (!FakePlayerManager.saveInventoryData(fpName))
            logger.warn(i18n.tr("fpManager.consoleLog.failToSaveInventory", fpName))

        if (!fp.offline())
            return i18n.tr("fpManager.resultText.offline.fail", fpName)
        FakePlayerManager.saveFpData(fpName, false)

        OnlineFpListSoftEnum.remove(fpName)
        if (!OfflineFpListSoftEnum.exists(fpName))
            OfflineFpListSoftEnum.add(fpName)
        return SUCCESS
    }

    // return ["fail result", ["aaa", "bbb", ...]] / [SUCCESS, ["aaa", "bbb", ...]]
    static onlineAll(executor) {
        let resultStr = ""
        let successNames = []
        FakePlayerManager.forEachFp((fpName, fp) => {
            if (!fp.isOnline() && PermManager.hasPermission(executor, "online", fpName)) {
                let res = FakePlayerManager.online(fpName, false)
                if (res != SUCCESS)
                    resultStr += res + "\n"
                else
                    successNames.push(fpName)
            }
        })
        if (resultStr == "")
            return [SUCCESS, successNames]
        else
            return [resultStr.substring(0, resultStr.length - 1), successNames]
    }

    // return ["fail result", ["aaa", "bbb", ...]] / [SUCCESS, ["aaa", "bbb", ...]]
    static offlineAll(executor) {
        let resultStr = ""
        let successNames = []
        FakePlayerManager.forEachFp((fpName, fp) => {
            if (fp.isOnline() && PermManager.hasPermission(executor, "offline", fpName)) {
                let res = FakePlayerManager.offline(fpName, false)
                if (res != SUCCESS)
                    resultStr += res + "\n"
                else
                    successNames.push(fpName)
            }
        })
        if (resultStr == "")
            return [SUCCESS, successNames]
        else
            return [resultStr.substring(0, resultStr.length - 1), successNames]
    }

    static createNew(fpName, x, y, z, dimid, ownerName, executor = null) {
        if (fpName in FakePlayerManager.fpListObj) {
            return i18n.tr("fpManager.resultText.fpExists", fpName)
        }

        let fp = new FakePlayerInst(fpName, { 'x': x.toFixed(2), 'y': y.toFixed(2), 'z': z.toFixed(2), 'dimid': dimid })
        FakePlayerManager.fpListObj[fpName] = fp
        AllFpListSoftEnum.add(fpName)
        FakePlayerManager.saveFpData(fpName, false)

        let result = PermManager.setOwner(executor, fpName, ownerName)
        if (result != SUCCESS) {
            FakePlayerManager.remove(fpName)   // withdraw previous changes
            return result
        }
        return SUCCESS
    }

    static remove(fpName) {
        if (!(fpName in FakePlayerManager.fpListObj))
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (FakePlayerManager.fpListObj[fpName].isOnline()) {
            FakePlayerManager.offline(fpName, false)
        }
        delete FakePlayerManager.fpListObj[fpName]

        if (fpName in FakePlayerManager.needTickFpListObj)
            delete FakePlayerManager.needTickFpListObj[fpName]
        AllFpListSoftEnum.remove(fpName)
        OnlineFpListSoftEnum.remove(fpName)
        OfflineFpListSoftEnum.remove(fpName)
        FakePlayerManager.deleteFpData(fpName)
        FakePlayerManager.deleteInventoryData(fpName)
        PermManager.deleteFpPermConfig(fpName)
        return SUCCESS
    }

    // return [SUCCESS, ["aaa", "bbb", ...] ]
    static list() {
        return [SUCCESS, Object.keys(FakePlayerManager.fpListObj)]
    }

    // return ["fail message", null] / [SUCCESS, {xxx:xxx, ...}]
    static getAllInfo(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return [i18n.tr("fpManager.resultText.fpNoFound", fpName), null]
        return [SUCCESS, fp.getAllInfo()]
    }

    // return ["fail message", null] / [SUCCESS, {xxx:xxx, ...}]
    static getPosition(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return [i18n.tr("fpManager.resultText.fpNoFound", fpName), null]
        return [SUCCESS, fp.getPos()]
    }

    // return ["fail message", null] / [SUCCESS, true / false]
    static isOnline(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return [i18n.tr("fpManager.resultText.fpNoFound", fpName), null]
        return [SUCCESS, fp.isOnline()]
    }

    static setOperation(fpName, operation, opInterval, opMaxTimes, opLength) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)

        if (operation == "clear") {
            fp.clearOperation()
        }
        else {
            if (!opInterval)
                opInterval = 1000
            if (!opMaxTimes)
                opMaxTimes = 1
            if (!opLength)
                opLength = 1000

            if (_LONG_OPERATIONS_LIST.includes(operation))
                fp.setLongOperation(operation, opInterval, opMaxTimes, opLength)
            else
                fp.setShortOperation(operation, opInterval, opMaxTimes)
        }
        return SUCCESS
    }

    static clearOperation(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        fp.clearOperation()
        return SUCCESS
    }

    // return ["fail reason", null] / [SUCCESS, {isFullPath:Boolean, path:Number[3][]} ]
    static walkToPos(fpName, pos) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return [i18n.tr("fpManager.resultText.fpNoFound", fpName), null]
        if (!fp.isOnline())
            return [i18n.tr("fpManager.resultText.fpNotOnline", fpName), null]
        let pl = fp.getPlayer()
        if (!pl)
            return [i18n.tr("fpManager.resultText.fpFailToGet", fpName), null]

        if (pos.dimid != pl.pos.dimid)
            return [i18n.tr("fpManager.resultText.fpNotInTargetDimension", fpName), null]
        let res = pl.simulateNavigateTo(pos)
        if (!res)
            return [i18n.tr("fpManager.resultText.fpFailToNavigate", fpName), null]

        if (res.path.length > 0) {
            let lastPathPos = res.path[res.path.length - 1]
            let dimid = fp.getPos().dimid
            fp.setPos(lastPathPos[0], lastPathPos[1], lastPathPos[2], dimid)
            FakePlayerManager.saveFpData(fpName)
        }
        return [SUCCESS, res]
    }

    // return ["fail reason", null] / [SUCCESS, {isFullPath:Boolean, path:Number[3][]} ]
    static walkToEntity(fpName, entity) {
        if (!entity)
            return [i18n.tr("fpManager.resultText.invalidTargetEntity", fpName), null]
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return [i18n.tr("fpManager.resultText.fpNoFound", fpName), null]
        if (!fp.isOnline())
            return [i18n.tr("fpManager.resultText.fpNotOnline", fpName), null]
        let pl = fp.getPlayer()
        if (!pl)
            return [i18n.tr("fpManager.resultText.fpFailToGet", fpName), null]

        if (pl.pos.dimid != entity.pos.dimid)
            return [i18n.tr("fpManager.resultText.fpNotInTargetDimension", fpName), null]
        let res = pl.simulateNavigateTo(EntityGetFeetPos(entity))
        if (!res)
            return [i18n.tr("fpManager.resultText.fpFailToNavigate", fpName), null]

        if (res.path.length > 0) {
            let lastPathPos = res.path[res.path.length - 1]
            let dimid = fp.getPos().dimid
            fp.setPos(lastPathPos[0], lastPathPos[1], lastPathPos[2], dimid)
            FakePlayerManager.saveFpData(fpName)
        }
        return [SUCCESS, res]
    }

    static teleportToPos(fpName, pos) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        let pl = fp.getPlayer()
        if (!pl)
            return i18n.tr("fpManager.resultText.fpFailToGet", fpName)

        if (!pl.teleport(pos))
            return i18n.tr("fpManager.resultText.fpFailToTransport", fpName)

        fp.setPos(pos.x, pos.y, pos.z, pos.dimid)
        FakePlayerManager.saveFpData(fpName, false)
        return SUCCESS
    }

    static teleportToEntity(fpName, entity) {
        if (!entity)
            return i18n.tr("fpManager.resultText.invalidTargetEntity", fpName)
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        let pl = fp.getPlayer()
        if (!pl)
            return i18n.tr("fpManager.resultText.fpFailToGet", fpName)

        let pos = EntityGetFeetPos(entity)
        if (!pl.teleport(pos))
            return i18n.tr("fpManager.resultText.fpFailToTransport", fpName)

        fp.setPos(pos.x, pos.y, pos.z, pos.dimid)
        FakePlayerManager.saveFpData(fpName)
        return SUCCESS
    }

    static giveItem(fpName, player) {
        if (!player)
            return i18n.tr("fpManager.resultText.invalidSourcePlayer", fpName)
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        let pl = fp.getPlayer()
        if (!pl)
            return i18n.tr("fpManager.resultText.fpFailToGet", fpName)

        let itemOld = player.getHand()
        if (itemOld.isNull())
            return SUCCESS
        let itemNew = itemOld.clone()
        let inventory = pl.getInventory()
        // check inventory has room
        if (inventory.hasRoomFor(itemNew)) {
            if (!inventory.addItem(itemNew))
                return i18n.tr("fpManager.resultText.fpFailToGiveItem", fpName)
        }
        else {
            // drop out hand first
            result = FakePlayerManager.dropItem(fpName, _DEFAULT_PLAYER_SELECT_SLOT)
            if (result != SUCCESS)
                return i18n.tr("fpManager.resultText.failToSpaceForNewItem", result)
            if (!inventory.addItem(itemNew))
                return i18n.tr("fpManager.resultText.fpFailToGiveItem", fpName)
        }
        itemOld.setNull()
        player.refreshItems()
        pl.refreshItems()
        if (!FakePlayerManager.saveInventoryData(fpName))
            logger.warn(i18n.tr("fpManager.consoleLog.failToSaveInventory", fpName))
        return SUCCESS
    }

    // return [SUCCESS, {Hand: {name:"xxx", count:64}, OffHand: {name:"xxx", count:32}, 
    //      Inventory: [null, {name:"xxx", count:64}, {...}], Armor: [{...}, {...}] } ]
    // / ["fail reason", null]
    static getInventory(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return [i18n.tr("fpManager.resultText.fpNoFound", fpName), null]
        if (!fp.isOnline())
            return [i18n.tr("fpManager.resultText.fpNotOnline", fpName), null]
        let pl = fp.getPlayer()
        if (!pl)
            return [i18n.tr("fpManager.resultText.fpFailToGet", fpName), null]
        let res = { Hand: null, OffHand: null, Inventory: [], Armor: [] }

        // hand
        let handItem = pl.getHand()
        if (!handItem.isNull())
            res.Hand = { name: handItem.name, count: handItem.count }

        // offhand
        let offHandItem = pl.getOffHand()
        if (!offHandItem.isNull())
            res.OffHand = { name: offHandItem.name, count: offHandItem.count }

        // inventory
        let inventory = pl.getInventory()
        for (let item of inventory.getAllItems()) {
            if (item.isNull())
                res.Inventory.push(null)
            else
                res.Inventory.push({ name: item.name, count: item.count })
        }

        // armor
        let armor = pl.getArmor()
        for (let item of armor.getAllItems()) {
            if (item.isNull())
                res.Armor.push(null)
            else
                res.Armor.push({ name: item.name, count: item.count })
        }
        return [SUCCESS, res]
    }

    static setSelectSlot(fpName, slotId) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        let pl = fp.getPlayer()
        if (!pl)
            return i18n.tr("fpManager.resultText.fpFailToGet", fpName)

        // Assuming that selected slotid defaults to 0
        let oldSlotId = _DEFAULT_PLAYER_SELECT_SLOT
        if (oldSlotId == slotId)
            return SUCCESS

        let inventory = pl.getInventory()
        let itemOld = inventory.getItem(oldSlotId)
        let itemNew = inventory.getItem(slotId)
        if (itemNew.isNull()) {
            if (!itemOld.setNull())
                return i18n.tr("fpManager.resultText.failToRemoveOldItem", fpName)
        }
        else {
            let itemOldClone = itemOld.clone()
            if (!inventory.setItem(oldSlotId, itemNew.clone()))
                return i18n.tr("fpManager.resultText.failToRemoveOldItem", fpName)
            if (!inventory.setItem(slotId, itemOldClone))
                return i18n.tr("fpManager.resultText.failToSetNewItem", fpName)
        }
        pl.refreshItems()
        if (!FakePlayerManager.saveInventoryData(fpName))
            logger.warn(i18n.tr("fpManager.consoleLog.failToSaveInventory", fpName))
        return SUCCESS
    }

    static dropItem(fpName, slotId) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        let pl = fp.getPlayer()
        if (!pl)
            return i18n.tr("fpManager.resultText.fpFailToGet", fpName)

        if (!slotId)
            slotId = _DEFAULT_PLAYER_SELECT_SLOT
        let inventory = pl.getInventory()
        let item = inventory.getItem(slotId)
        if (item.isNull())
            return i18n.tr("fpManager.resultText.dropItem.slotIsEmpty", slotId)
        // spawn dropped item at 2 blocks away
        if (!mc.spawnItem(item.clone(), CalcPosFromViewDirection(EntityGetFeetPos(pl), pl.direction, 2)))
            return i18n.tr("fpManager.resultText.dropItem.fail")
        if (!inventory.removeItem(slotId, item.count))
            return i18n.tr("fpManager.resultText.dropItem.failToRemoveOld", slotId)
        if (!FakePlayerManager.saveInventoryData(fpName))
            logger.warn(i18n.tr("fpManager.consoleLog.failToSaveInventory", fpName))
        return SUCCESS
    }

    static dropAllItems(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        let pl = fp.getPlayer()
        if (!pl)
            return i18n.tr("fpManager.resultText.fpFailToGet", fpName)

        let inventory = pl.getInventory()
        let size = inventory.size

        let resultStr = ""
        for (let slotId = 0; slotId < size; ++slotId) {
            let item = inventory.getItem(slotId)
            if (item.isNull())
                continue
            // spawn dropped item at 2 blocks away
            if (!mc.spawnItem(item.clone(), CalcPosFromViewDirection(EntityGetFeetPos(pl), pl.direction, 2)))
                resultStr += i18n.tr("fpManager.resultText.dropItem.failToDropOld", slotId) + "\n"
            if (!inventory.removeItem(slotId, item.count))
                resultStr += i18n.tr("fpManager.resultText.dropItem.failToRemoveOld", slotId) + "\n"
        }
        if (!FakePlayerManager.saveInventoryData(fpName))
            logger.warn(i18n.tr("fpManager.consoleLog.failToSaveInventory", fpName))
        return resultStr == "" ? SUCCESS : resultStr.substring(0, resultStr.length - 1)
    }

    static startSync(fpName, player) {
        if (!player)
            return i18n.tr("fpManager.resultText.invalidTargetPlayer")
        if (player.isSimulatedPlayer())
            return i18n.tr("fpManager.resultText.sync.withAnotherFp")
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        fp.startSync(player.xuid)

        FakePlayerManager.needTickFpListObj[fpName] = fp
        FakePlayerManager.saveFpData(fpName)
        return SUCCESS
    }

    static stopSync(fpName) {
        let fp = FakePlayerManager.getFpInstance(fpName)
        if (!fp)
            return i18n.tr("fpManager.resultText.fpNoFound", fpName)
        if (!fp.isOnline())
            return i18n.tr("fpManager.resultText.fpNotOnline", fpName)
        fp.stopSync()

        let pl = fp.getPlayer()
        if (pl)
            pl.simulateStopMoving()

        if (fpName in FakePlayerManager.needTickFpListObj)
            delete FakePlayerManager.needTickFpListObj[fpName]
        FakePlayerManager.saveFpData(fpName)
        fp.applyDirection()
        return SUCCESS
    }

    // return ["SUCCESS", "Help text"]
    static getHelp() {
        let textRaw = i18n.tr("fpManager.resultText.helpText")
        return [SUCCESS, textRaw.replaceAll("\\n", "\n")]
    }
}


/////////////////////////////////////////////////////////////////////////////////////
//                                   Export APIs                                   //
/////////////////////////////////////////////////////////////////////////////////////

export function ExportFakePlayerAPIs() {
    ll.export(FakePlayerManager.online, "_LLSE_FakePlayer_PLUGIN_", "online")
    ll.export(FakePlayerManager.offline, "_LLSE_FakePlayer_PLUGIN_", "offline")
    ll.export(FakePlayerManager.createNew, "_LLSE_FakePlayer_PLUGIN_", "createNew")
    ll.export(FakePlayerManager.remove, "_LLSE_FakePlayer_PLUGIN_", "remove")
    ll.export(FakePlayerManager.list, "_LLSE_FakePlayer_PLUGIN_", "list")
    ll.export(FakePlayerManager.getAllInfo, "_LLSE_FakePlayer_PLUGIN_", "getAllInfo")
    ll.export(FakePlayerManager.getPosition, "_LLSE_FakePlayer_PLUGIN_", "getPosition")
    ll.export(FakePlayerManager.isOnline, "_LLSE_FakePlayer_PLUGIN_", "isOnline")
    ll.export(FakePlayerManager.setOperation, "_LLSE_FakePlayer_PLUGIN_", "setOperation")
    ll.export(FakePlayerManager.clearOperation, "_LLSE_FakePlayer_PLUGIN_", "clearOperation")
    ll.export(FakePlayerManager.walkToPos, "_LLSE_FakePlayer_PLUGIN_", "walkToPos")
    ll.export(FakePlayerManager.walkToEntity, "_LLSE_FakePlayer_PLUGIN_", "walkToEntity")
    ll.export(FakePlayerManager.teleportToPos, "_LLSE_FakePlayer_PLUGIN_", "teleportToPos")
    ll.export(FakePlayerManager.teleportToEntity, "_LLSE_FakePlayer_PLUGIN_", "teleportToEntity")
    ll.export(FakePlayerManager.giveItem, "_LLSE_FakePlayer_PLUGIN_", "giveItem")
    ll.export(FakePlayerManager.getInventory, "_LLSE_FakePlayer_PLUGIN_", "getInventory")
    ll.export(FakePlayerManager.setSelectSlot, "_LLSE_FakePlayer_PLUGIN_", "setSelectSlot")
    ll.export(FakePlayerManager.dropItem, "_LLSE_FakePlayer_PLUGIN_", "dropItem")
    ll.export(FakePlayerManager.dropAllItems, "_LLSE_FakePlayer_PLUGIN_", "dropAllItems")
    ll.export(FakePlayerManager.getHelp, "_LLSE_FakePlayer_PLUGIN_", "getHelp")
    ll.export(FakePlayerManager.saveFpData, "_LLSE_FakePlayer_PLUGIN_", "saveFpData")
    ll.export(FakePlayerManager.saveInventoryData, "_LLSE_FakePlayer_PLUGIN_", "saveInventoryData")
}