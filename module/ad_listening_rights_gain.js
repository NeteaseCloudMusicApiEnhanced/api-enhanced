// 看广告免费听歌 - 领取免费听权益
// 请求流程（基于逆向网易云音乐 v9.5.61 原生 Kotlin 源码，classes5/18/19.dex）：
// 1. 从广告平台拉广告 → 用户看完/点击广告 → 获取 ad 对象的 extJson.contextInfo.req_id 作为 reqUid
// 2. 调用本接口传入 reqUid 及相关权益参数，领取权益
// 3. 服务器返回 gainFlag 等标识，用于展示领取结果
//
// 调用链（逆向还原）：
//   AdDSLIncentiveVideoRightsHelper.requestRightsGainInner
//     → AdDSLUtils.requestRightGain(ad, exposeTime, clickTime, creativeType, cb)
//     → 构造 ListeningRightRequestParams（21 字段）→ JSON.stringify
//     → body = { "reqParam": "..." } → POST /api/ad/listening/rights/gain
//   （注意：客户端 AdDSLIncentiveVideoRightsHelper 写死 creativeType=36）
//
// 接口不只领取听歌时长，还包含"看视频得云贝"等权益：
//   rightsGainMethod=6 (LAXIN_EXPOSE_OR_DOWNLOAD 拉新曝光/下载分段权益) 时，
//   弹窗 AdLaxinSegmentedGuideDialog 展示 "获得X云贝"（2000 云贝等），
//   权益数值由广告下发的 AdLaxinSegmentedRightsGuidePopup.rightsValue 决定，
//   extraRightsType 作为权益类型随本接口上传。
//
// rightsGainMethod 枚举（h80/a）：
//   1=EXPOSE 曝光, 2=EXPOSE_CLICK 曝光+点击, 3=EXPOSE_DOWNLOAD 曝光+下载,
//   4=CLICK_STAY 点击+停留, 5=EXPOSURE_OR_CLICK_STAY 曝光或点击停留,
//   6=LAXIN_EXPOSE_OR_DOWNLOAD 拉新曝光/下载分段权益

const createOption = require('../util/option.js')
const adGet = require('./ad_get.js')

// 安全 JSON 解析（字符串字段可能是 JSON 文本）
function safeParse(str, fallback) {
  if (typeof str !== 'string') return fallback
  try {
    return JSON.parse(str)
  } catch (_) {
    return fallback
  }
}

module.exports = async (query, request) => {
  const time = Date.now()

  // 从广告对象自动补齐请求字段。
  // 实测 v9.5.61 真实 API 返回（/ad/get）确认的字段路径：
  //   reqUid        = ad.extJson.contextInfo.req_id（真实响应中唯一存在）
  //   contextInfo   = ad.extJson.contextInfo（完整对象序列化）
  //   generalRightsInfo = ad.generalRightsInfo（字符串 JSON）
  //   creativeType  = ad.creativeType
  //   rightsGainMethod / extraRightsType / rightsGainDuration / rightsGainType /
  //   extraRightsGainMethod / extraRightsGainDuration / nextRightsGainDuration /
  //   rightsExtJson / source / rightsUpperLimit / qualified
  //                 = ad.generalRightsInfo（字符串）解析后取值
  //   （逆向类字段 adExtMap/adLogId/listeningRightHintInfo 真实响应中不存在，仅兜底）
  //   sniffTime     = method==3 或 6 时 currentTimeMillis
  let reqUid = query.reqUid || ''
  let contextInfo = query.contextInfo
  let creativeType = query.creativeType
  let generalRightsInfo = query.generalRightsInfo

  // 广告 hint 配置：仅当调用方未显式传参时用广告下发值兜底
  const hint = {}

  if (!reqUid || contextInfo === undefined || creativeType === undefined) {
    try {
      const adRes = await adGet(
        { ...query, type_ids: query.type_ids || '["400002_0"]' },
        request,
      )
      const ad = Object.values(adRes?.body?.ads || {})[0]
      if (!ad) throw new Error('ads 为空（未登录或广告位无广告）')

      // reqUid：真实 API 返回中 req_id 在 ad.extJson.contextInfo.req_id（实测 v9.5.61）
      //   （逆向类字段 adExtMap/adLogId 在真实响应中不存在，仅作兜底）
      if (!reqUid) {
        const ext =
          typeof ad?.extJson === 'string'
            ? safeParse(ad.extJson, {})
            : ad?.extJson || {}
        const extMap =
          typeof ad?.adExtMap === 'string'
            ? safeParse(ad.adExtMap, {})
            : ad?.adExtMap
        reqUid =
          ext?.contextInfo?.req_id ||
          extMap?.req_id ||
          ad?.adLogId?.requestId ||
          ad?.reqId ||
          adRes?.body?.extra?.reqId ||
          ''
      }
      // contextInfo：真实 API 返回中在 ad.extJson.contextInfo（实测 v9.5.61）
      if (contextInfo === undefined) {
        const ext =
          typeof ad?.extJson === 'string'
            ? safeParse(ad.extJson, {})
            : ad?.extJson || {}
        const ci =
          ext?.contextInfo || ad?.adLogId?.contextInfo || ad?.showContext
        if (ci) {
          contextInfo = typeof ci === 'string' ? ci : JSON.stringify(ci)
        }
      }
      if (creativeType === undefined && ad?.creativeType !== undefined) {
        creativeType = ad.creativeType
      }
      if (generalRightsInfo === undefined && ad?.generalRightsInfo) {
        generalRightsInfo =
          typeof ad.generalRightsInfo === 'string'
            ? ad.generalRightsInfo
            : JSON.stringify(ad.generalRightsInfo)
      }
      // 缓存广告下发的领取配置（后续用于兜底）
      // 实测 v9.5.61：rightsGainMethod/rightsUpperLimit/qualified 等在
      //   ad.generalRightsInfo（字符串）里，ad.listeningRightHintInfo 真实响应中不存在
      const hintCfg =
        typeof ad?.listeningRightHintInfo === 'string'
          ? safeParse(ad.listeningRightHintInfo, {})
          : ad?.listeningRightHintInfo || {}
      const gri =
        typeof ad?.generalRightsInfo === 'string'
          ? safeParse(ad.generalRightsInfo, {})
          : ad?.generalRightsInfo || {}
      Object.assign(hint, hintCfg, gri)
      console.log(`自动获取 reqUid: ${reqUid}`)
    } catch (e) {
      // 获取广告失败，后续请求会因缺少 reqUid 被拒绝
    }
  }

  const rightsGainMethod = query.rightsGainMethod
    ? parseInt(query.rightsGainMethod)
    : hint.rightsGainMethod || 2

  const rightsParam = {
    // 必填: 广告请求 ID，自动从 ad_get 获取
    reqUid,

    // 曝光时间戳
    exposureTime: query.exposureTime ? parseInt(query.exposureTime) : time,

    // 当前登录用户 ID（原版客户端从 Profile.getUserId() 获取）
    userId: query.uid ? parseInt(query.uid) : undefined,

    // 点击时间戳
    clickTime: query.clickTime ? parseInt(query.clickTime) : time,

    // 额外权益类型（拉新分段权益等，决定发放云贝/时长/下载，来自广告配置）
    extraRightsType: query.extraRightsType
      ? parseInt(query.extraRightsType)
      : hint.extraRightsType !== undefined
        ? parseInt(hint.extraRightsType)
        : undefined,

    // 是否连续播放（默认 false）
    playContinuously: query.playContinuously ? true : false,

    // 来源标识（原版从 ad.listeningRightHintInfo.source 读取）
    source: query.source
      ? parseInt(query.source)
      : hint.source !== undefined
        ? parseInt(hint.source)
        : undefined,

    // 广告创意类型（激励视频场景=36，优先取 query / 广告对象）
    creativeType: creativeType !== undefined ? parseInt(creativeType) : 36,

    // 权益领取方式（1~6 枚举，见文件头注释）
    rightsGainMethod,

    // 权益扩展方式与时长
    extraRightsGainMethod: query.extraRightsGainMethod
      ? parseInt(query.extraRightsGainMethod)
      : hint.extraRightsGainMethod !== undefined
        ? parseInt(hint.extraRightsGainMethod)
        : undefined,
    extraRightsGainDuration: query.extraRightsGainDuration
      ? parseInt(query.extraRightsGainDuration)
      : hint.extraRightsGainDuration !== undefined
        ? parseInt(hint.extraRightsGainDuration)
        : undefined,
    nextRightsGainDuration: query.nextRightsGainDuration
      ? parseInt(query.nextRightsGainDuration)
      : hint.nextRightsGainDuration !== undefined
        ? parseInt(hint.nextRightsGainDuration)
        : undefined,

    // 权益类型（含 RIGHTS_GAIN_TYPE_CURRENT_DAY 等取值）
    rightsGainType: query.rightsGainType
      ? parseInt(query.rightsGainType)
      : hint.rightsGainType !== undefined
        ? parseInt(hint.rightsGainType)
        : undefined,

    // 权益时长
    rightsGainDuration: query.rightsGainDuration
      ? parseInt(query.rightsGainDuration)
      : hint.rightsGainDuration !== undefined
        ? parseInt(hint.rightsGainDuration)
        : undefined,

    // 领取步骤（UNGAIN/GAINING/GAIN_FINISHED 对应的值）
    gainMethodStep: query.gainMethodStep
      ? parseInt(query.gainMethodStep)
      : undefined,

    // 通用权益信息（ad.generalRightsInfo 序列化 JSON）
    generalRightsInfo,

    // 权益扩展信息
    rightsExtJson: query.rightsExtJson || hint.rightsExtJson || undefined,

    // 应用信息（下载类广告）
    appInfo: query.appInfo ? JSON.parse(query.appInfo) : undefined,

    // 广告上下文（ad.adLogId.contextInfo，客户端真实来源）
    contextInfo,

    // 应用是否已安装（下载类广告）
    installed: query.installed ? parseInt(query.installed) : undefined,

    // 嗅探时间：逆向确认（classes5.dex AdDSLUtils.requestRightGain）：
    //   rightsGainMethod==3(曝光+下载) 或 6(LAXIN) 时传 currentTimeMillis
    sniffTime:
      rightsGainMethod === 3 || rightsGainMethod === 6
        ? query.sniffTime
          ? parseInt(query.sniffTime)
          : time
        : undefined,
  }

  // 清理 undefined 字段
  Object.keys(rightsParam).forEach((key) => {
    if (rightsParam[key] === undefined) delete rightsParam[key]
  })

  // 将参数序列化为 reqParam 字符串 (与原生源码一致)
  const data = {
    reqParam: JSON.stringify(rightsParam),
  }

  const res = await request(
    `/api/ad/listening/rights/gain`,
    data,
    createOption(query, 'xeapi', 'v3'),
  )

  return {
    status: 200,
    body: {
      code: 200,
      data: res.body,
    },
  }
}
