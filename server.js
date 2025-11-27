// 不再使用 Twelve Data，改用 Naver 韩国行情
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/**
 * 从 Naver 获取韩国股票价格
 * symbol 写法：
 *   - 005930.KS / 005930.KQ / 005930  都可以
 *   - 我们会自动取前面 6 位数字作为代码
 */
async function fetchPrice(symbol) {
  if (!symbol) throw new Error("symbol 必填");

  let code = String(symbol).trim();
  // 如果包含 .KS / .KQ 等，只取前 6 位数字
  if (code.includes(".")) {
    code = code.split(".")[0];
  }

  // 只接受 6 位数字代码，如 005930
  const match = code.match(/\d{6}/);
  if (!match) {
    throw new Error("股票代码必须是 6 位数字，例如 005930");
  }
  code = match[0];

  // Naver 实时行情接口
  const url = `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${code}`;

  const res = await axios.get(url, {
    timeout: 5000,
    headers: {
      // 一些环境需要带上 Referer 才返回
      Referer: "https://finance.naver.com"
    }
  });

  if (!res.data || !res.data.result || !Array.isArray(res.data.result.areas)) {
    throw new Error("Naver 行情返回格式异常");
  }

  const areas = res.data.result.areas;
  if (!areas.length || !areas[0].datas || !areas[0].datas.length) {
    throw new Error("Naver 行情中找不到该代码");
  }

  const stock = areas[0].datas[0];

  // 不同环境字段名可能略有差异，我们依次尝试
  const price =
    Number(stock.nv) ||          // 常见字段：现价(now value)
    Number(stock.tradePrice) ||  // 有些返回 tradePrice
    Number(stock.closePrice);    // 或 closePrice

  if (!price || Number.isNaN(price)) {
    throw new Error("Naver 行情价格无效");
  }

  return price;
}

// 单只股票价格
app.get("/api/price", async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol 必填" });

  try {
    const price = await fetchPrice(symbol);
    res.json({ symbol, price });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "获取价格失败" });
  }
});

// 批量股票价格
app.post("/api/prices", async (req, res) => {
  const { symbols } = req.body;
  if (!Array.isArray(symbols) || !symbols.length) {
    return res.status(400).json({ error: "symbols 必须是非空数组" });
  }

  const result = {};
  for (const s of symbols) {
    try {
      const price = await fetchPrice(s);
      result[s] = { ok: true, price };
    } catch (err) {
      result[s] = { ok: false, error: err.message };
    }
  }

  res.json(result);
});

// 健康检查
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
