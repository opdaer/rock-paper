// webpack.config.js

const path = require('path');

module.exports = {
    entry: './src/index.jsx', // React 代码的入口文件
    output: {
        path: path.resolve(__dirname, 'public'), // 输出到 'public' 目录
        filename: 'bundle.js', // 输出的打包文件名
        publicPath: '/', // 公共路径
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/, // 匹配 .js 和 .jsx 文件
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader', // 使用 Babel loader
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react'], // 使用的预设
                    },
                },
            },
            {
                test: /\.css$/, // 匹配 .css 文件
                use: ['style-loader', 'css-loader', 'postcss-loader'], // 添加 postcss-loader
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i, // 匹配图片文件
                type: 'asset/resource', // 处理资源文件
            },
        ],
    },
    resolve: {
        extensions: ['.js', '.jsx'], // 解析文件扩展名
    },
};
