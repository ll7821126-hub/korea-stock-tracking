const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ⭐ 静态托管，让网站访问 / 时能够显示 public/index.html
app.use(express.static("public"));

const API_KEY = process.env.TWELVE_DATA_API_KEY;

// 获取股票最新价格接口
app.get("/api/price", async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) {
      return res.status(400).json({ error: "symbol 参数必填" });
    }

    const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${API_KEY}`;
    const response = await axios.get(url);

    if (response.data.price) {
      res.json({ price: Number(response.data.price) });
    } else {
      res.status(500).json({ error: "API 返回无效价格", detail: response.data });
    }
  } catch (error) {
    res.status(500).json({ error: "行情获取失败", detail: error.message });
  }
});

// ⭐ 捕获所有未匹配路由 → 始终返回前端界面
// 解决 Render 打开网址出现“无法获取 /”问题
app.get("*", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// 启动服务
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
