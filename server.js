const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// 静态托管前端界面
app.use(express.static("public"));

/* 工具：把 symbol 转成 Naver 六位纯数字代码 */
function toNaverCode(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toUpperCase();
  s = s.replace(/\.(KS|KQ|KR)$/i, ""); // 去掉 .KS / .KQ
  s = s.replace(/\D/g, ""); // 仅保留数字
  if (!s) return null;
  if (s.length < 6) s = s.padStart(6, "0");
  return s;
}

/* 访问 Naver */
async function fetchNaverPrice(code) {
  const url = `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${code}`;

  const resp = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      Referer: "https://finance.naver.com/"
    },
    timeout: 5000
  });

  const data = resp.data;
  const areas = data?.result?.areas;
  const first = areas?.[0]?.datas?.[0];

  if (!first) throw new Error("Naver 返回中没有 datas 数据");

  // 调试打印结构（只在首次失败时显示）
  console.log("🔍 Naver 原始返回:", first);

  // 逐字段匹配，避免 API 字段变化导致失败
  let raw =
    first.now ??
    first.nv ??
    first.cv ??
    first.clpr ??
    first.close ??
    first.price ??
    first.tradePrice ??
    null;

  if (typeof raw === "string") raw = Number(raw.replace(/,/g, ""));

  if (typeof raw !== "number" || Number.isNaN(raw)) {
    throw new Error("Naver 返回中未找到可解析的价格字段");
  }

  return raw;
}

/* ▶ 单只股票价格（测试） */
app.get("/api/price", async (req, res) => {
  try {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ ok: false, error: "symbol 参数必填" });

    const code = toNaverCode(symbol);
    if (!code) return res.status(400).json({ ok: false, error: "symbol 格式无效" });

    const price = await fetchNaverPrice(code);
    return res.json({ ok: true, symbol, code, price });
  } catch (err) {
    console.error("❌ 单只行情失败:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* ▶ 批量行情（前端刷新行情使用） */
app.post("/api/prices", async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: "symbols 必须是数组且不可为空" });
    }

    const symbolToCode = {};
    symbols.forEach(sym => {
      const c = toNaverCode(sym);
      if (c) symbolToCode[sym] = c;
    });

    const uniqueCodes = [...new Set(Object.values(symbolToCode))];
    const cache = {}; // 避免同一代码多次请求

    await Promise.all(
      uniqueCodes.map(async code => {
        try {
          const price = await fetchNaverPrice(code);
          cache[code] = { ok: true, price };
        } catch (err) {
          cache[code] = { ok: false, error: err.message };
          console.error("❌ 批量行情失败:", code, err.message);
        }
      })
    );

    const result = {};
    Object.entries(symbolToCode).forEach(([sym, code]) => {
      result[sym] = { code, ...cache[code] };
    });

    return res.json(result);
  } catch (err) {
    console.error("🚨 批量行情接口异常:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* ▶ 避免 Render 刷新页面 404 */
app.get("*", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
