// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 静态托管前端
app.use(express.static("public"));

/**
 * 从 Naver 抓取韩股价格
 * symbol 示例：'005930'、'338220'
 */
async function fetchKoreaPriceFromNaver(symbol) {
  // 防止传入 '005930.KS' 之类，统一只保留数字
  const code = String(symbol).match(/\d{6}/);
  if (!code) {
    throw new Error(`无效代码: ${symbol}`);
  }
  const stockCode = code[0];

  const url = `https://finance.naver.com/item/sise.nhn?code=${stockCode}`;

  const { data: html } = await axios.get(url, {
    headers: {
      // 带上 User-Agent，减少被 Naver 拦截的概率
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://finance.naver.com/",
    },
    responseType: "text",
    transformResponse: [(d) => d], // 不要自动 JSON 解析
  });

  // 从 <p class="no_today">...</p> 里取第一个 <span class="blind">数字</span>
  const blockMatch = html.match(
    /<p\s+class="no_today"[^>]*>([\s\S]*?)<\/p>/
  );
  if (!blockMatch) {
    throw new Error("未找到 no_today 区块（当前价）");
  }

  const block = blockMatch[1];
  const priceMatch = block.match(/<span[^>]*class="blind"[^>]*>([\d,]+)<\/span>/);
  if (!priceMatch) {
    throw new Error("未在 no_today 中解析出价格");
  }

  const priceStr = priceMatch[1].replace(/,/g, "");
  const price = Number(priceStr);

  if (!isFinite(price) || price <= 0) {
    throw new Error("解析出的价格无效: " + priceStr);
  }

  return price;
}

/**
 * 批量接口：POST /api/prices
 * body: { symbols: ["005930","338220", ...] }
 */
app.post("/api/prices", async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: "symbols 必须是非空数组" });
    }

    const result = {};

    // 顺序抓取，避免对 Naver 压力太大；数量不多的话足够用
    for (const symbol of symbols) {
      try {
        const price = await fetchKoreaPriceFromNaver(symbol);
        result[symbol] = { ok: true, price };
      } catch (err) {
        console.error(
          "获取价格失败:",
          symbol,
          err.message || err.toString()
        );
        result[symbol] = { ok: false, error: err.message || "解析失败" };
      }
    }

    res.json(result);
  } catch (err) {
    console.error("批量价格接口异常:", err);
    res.status(500).json({ error: "服务器错误" });
  }
});

// 兜底：所有其他路由都返回前端页面
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
