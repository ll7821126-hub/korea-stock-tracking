from flask import Flask, request, jsonify
from flask_cors import CORS
import yfinance as yf
import time

app = Flask(__name__)
# 允许跨域请求
CORS(app)

@app.route('/')
def home():
    return "Stock API (Real-time Optimized) is running!"

@app.route('/api/prices', methods=['POST'])
def get_prices():
    try:
        data = request.json
        codes = data.get('codes', [])
        
        if not codes:
            return jsonify({})

        # 这里的逻辑优化：同时尝试 .TW 和 .TWO
        # 为了提高速度，我们构建一个查找字典
        unique_codes = list(set(codes))
        
        results = {}
        
        for code in unique_codes:
            # 1. 优先尝试上市股票代码 (.TW)
            symbol_tw = f"{code}.TW"
            symbol_two = f"{code}.TWO"
            
            try:
                # 使用 Ticker 对象
                stock = yf.Ticker(symbol_tw)
                
                # --- 核心修改：使用 fast_info 获取最新报价 ---
                # fast_info['last_price'] 通常比 history() 更实时
                price = None
                
                # 尝试获取 .TW 的价格
                try:
                    if stock.fast_info and 'last_price' in stock.fast_info:
                        price = stock.fast_info['last_price']
                except:
                    pass

                # 如果 .TW 没拿到价格，或者价格显然不对（比如是 None），尝试 .TWO (上柜)
                if price is None:
                    try:
                        stock_two = yf.Ticker(symbol_two)
                        if stock_two.fast_info and 'last_price' in stock_two.fast_info:
                            price = stock_two.fast_info['last_price']
                    except:
                        pass
                
                # 如果 fast_info 都失败了，最后尝试 history 作为保底
                if price is None:
                    try:
                        hist = stock.history(period="1d")
                        if not hist.empty:
                            price = hist['Close'].iloc[-1]
                    except:
                        pass

                # 格式化价格，保留2位小数
                if price is not None:
                    results[code] = round(float(price), 2)
                else:
                    results[code] = None # 真的抓不到

            except Exception as e:
                print(f"Error fetching {code}: {e}")
                results[code] = None

        # 添加一个时间戳，防止前端缓存
        response = jsonify(results)
        response.headers.add('Cache-Control', 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0')
        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)