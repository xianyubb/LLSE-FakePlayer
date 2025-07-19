// Pre-defined paths and dirs
export const _CONFIG_PATH = "./mods/LLSE-FakePlayer/config.json"
export const _FP_DATA_DIR = "./mods/LLSE-FakePlayer/fpdata/"
export const _FP_INVENTORY_DIR = "./mods/LLSE-FakePlayer/fpinventorys/"
export const _FP_PERMISSION_DIR = "./mods/LLSE-FakePlayer/fppermissions/"
export const _I18N_DIR = "./mods/LLSE-FakePlayer/LangPack"

// Pre-defined global consts
export const _DEFAULT_PLAYER_SELECT_SLOT = 0
export const SUCCESS = ""
export const _LONG_OPERATIONS_LIST = ["useitem"]
export const _SHORT_OPERATIONS_LIST = ["attack", "interact"/*, "destroy", "place" */, "clear"]
export let _VALID_DIMENSION_NAMES: any[] = []
export let _VALID_GAMEMODE_NAMES: any = {}


export function InitGlobalVars() {
    _VALID_DIMENSION_NAMES = [
        i18n.tr("dimension.name.mainworld"),
        i18n.tr("dimension.name.nether"),
        i18n.tr("dimension.name.end")
    ]

    _VALID_GAMEMODE_NAMES['0'] = i18n.tr("gameMode.name.survival")
    _VALID_GAMEMODE_NAMES['1'] = i18n.tr("gameMode.name.creative")
    _VALID_GAMEMODE_NAMES['2'] = i18n.tr("gameMode.name.adventure")
    _VALID_GAMEMODE_NAMES['5'] = i18n.tr("gameMode.name.default")
    _VALID_GAMEMODE_NAMES['6'] = i18n.tr("gameMode.name.spectator")
}