const PriceCalculator = {
    calculate(koreaCost, settings = null) {
        if (!settings) settings = DB.getSettings();
        const { exchange_divisor, price_multiplier, fixed_addition } = settings;
        const actualConvertedCost = koreaCost / exchange_divisor;
        const chinaBasePrice = actualConvertedCost * price_multiplier + fixed_addition;
        return {
            actual_converted_cost: Math.round(actualConvertedCost),
            china_base_price: Math.round(chinaBasePrice)
        };
    },

    calculateProfit(sellingPrice, actualConvertedCost, quantity = 1) {
        const profit = (sellingPrice - actualConvertedCost) * quantity;
        const totalRevenue = sellingPrice * quantity;
        const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
        const costRatio = sellingPrice > 0 ? (actualConvertedCost / sellingPrice) * 100 : 0;
        return {
            profit: Math.round(profit),
            profit_margin: Math.round(profitMargin),
            cost_ratio: Math.round(costRatio)
        };
    }
};
