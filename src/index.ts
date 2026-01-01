const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
import { Logger } from './logger';
import { ChatworkClient } from './chatwork';

/**
 * X (Twitter) 自動投稿ツール (JSON設定・連続投稿対応版)
 * * 使い方:
 * 1. ログイン: node x_bot.js login
 * 2. 連続投稿: node x_bot.js batch morning service_intro
 * (引数に指定したキーを5分間隔で順次投稿します)
 */

const STORAGE_STATE_PATH = path.join(__dirname, 'x_session.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');

// パス解決ヘルパー
function getPaths(userName: string | null = null) {
  if (userName) {
    // ユーザー指定あり: src/sessions/{user}.json, src/configs/{user}.json
    const sessionDir = path.join(__dirname, 'sessions');
    const configDir = path.join(__dirname, 'configs');

    // ディレクトリがなければ作成
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    return {
      sessionPath: path.join(sessionDir, `${userName}.json`),
      configPath: path.join(configDir, `${userName}.json`)
    };
  } else {
    // 指定なし: 従来のパス (直下の x_session.json, config.json)
    return {
      sessionPath: path.join(__dirname, 'x_session.json'),
      configPath: path.join(__dirname, 'config.json')
    };
  }
}

// 設定ファイルの読み込み
function loadConfig(userName: string | null = null) {
  const { configPath } = getPaths(userName);
  if (!fs.existsSync(configPath)) {
    console.error(`設定ファイルが見つかりません: ${configPath}`);
    if (userName) {
      console.error(`ヒント: src/configs/${userName}.json を作成してください。`);
    } else {
      console.error('config.json が見つかりません。');
    }
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function login(userName: string | null = null) {
  const { sessionPath } = getPaths(userName);
  console.log('DEBUG: login() function called');
  console.log(`推奨: アカウント "${userName || 'default'}" でログインします。セッション保存先: ${sessionPath}`);
  console.log('ログインを開始します。手動でログインを完了させてください...');

  try {
    const browser = await launchBrowser(false);
    console.log('DEBUG: Browser launched successfully.');

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    console.log('DEBUG: Context created.');

    const page = await context.newPage();
    console.log('DEBUG: Page created.');

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log('DEBUG: Navigating to login page...');
    await page.goto('https://x.com/i/flow/login');
    console.log('DEBUG: Navigation started.');

    try {
      await page.waitForURL('**/home', { timeout: 180000 });
      await context.storageState({ path: sessionPath });
      console.log('ログインセッションを保存しました。');
    } catch (e) {
      console.error('ログイン待機中にタイムアウトしました。', e);
    }
    await browser.close();
    console.log('DEBUG: Browser closed.');
  } catch (err) {
    console.error('CRITICAL ERROR in login:', err);
  }
}

async function postTweet(text: any, mediaPath: any = null, headless = false, userName: string | null = null) {
  const { sessionPath } = getPaths(userName);
  if (!fs.existsSync(sessionPath)) {
    console.error(`セッションファイルがありません: ${sessionPath}`);
    console.error('loginを実行してください。');
    return false;
  }

  const browser = await launchBrowser(headless);
  const context = await browser.newContext({
    storageState: sessionPath,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto('https://x.com/compose/post');
    const tweetBoxSelector = 'div[data-testid="tweetTextarea_0"]';
    await page.waitForSelector(tweetBoxSelector, { timeout: 15000 });
    await page.fill(tweetBoxSelector, text);

    if (mediaPath) {
      const absolutePath = path.resolve(mediaPath);
      if (fs.existsSync(absolutePath)) {
        const fileInputSelector = 'input[data-testid="fileInput"]';
        await page.setInputFiles(fileInputSelector, absolutePath);
        await page.waitForSelector('div[data-testid="attachments"]', { timeout: 30000 });
      }
    }

    const postButtonSelector = 'button[data-testid="tweetButton"]';
    await page.waitForFunction(s => {
      const b = document.querySelector(s);
      return b && !b.disabled;
    }, postButtonSelector);

    await page.click(postButtonSelector);
    await page.waitForTimeout(5000);
    console.log('投稿に成功しました。');
    return true;
  } catch (error) {
    console.error('投稿エラー:', error);
    return false;
  } finally {
    await browser.close();
  }
}

async function runBatch(keys: any, headless = false, userName: string | null = null) {
  const logger = new Logger(userName, 'post');
  logger.log(`Starting runBatch with keys: ${keys.join(', ')}`);

  const config = loadConfig(userName);
  const waitTime = 10 * 60 * 1000; // 5分 (ミリ秒)

  try {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const item = config.patterns[key];

      if (!item) {
        logger.error(`パターン "${key}" が設定ファイルに存在しません。スキップします。`);
        continue;
      }

      logger.log(`[${i + 1}/${keys.length}] 投稿開始: ${key}`);
      // Capture console output of postTweet? It uses console.log.
      // We can't easily capture it without changing postTweet. 
      // For now, we log the attempt and result here.
      const success = await postTweet(item.text, item.media, headless, userName);
      if (success) logger.log(`投稿成功: ${key}`);
      else logger.error(`投稿失敗: ${key}`);

      // 最後の投稿以外は待機
      if (i < keys.length - 1) {
        logger.log(`次の投稿まで5分間待機します...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    logger.log('すべてのバッチ投稿が完了しました。');
  } catch (e) {
    logger.error('Error in runBatch', e);
  } finally {
    await handleChatworkNotification(config, logger);
  }
}

// ブラウザ起動ヘルパー
async function launchBrowser(headless = false) {
  console.log('DEBUG: Attempting to launch browser (forcing system Chrome/Edge)...');
  let browser;
  try {
    console.log('DEBUG: Trying to launch Google Chrome...');
    browser = await chromium.launch({
      headless,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch (e) {
    console.log('DEBUG: Chrome not found, trying Microsoft Edge...');
    try {
      browser = await chromium.launch({
        headless,
        channel: 'msedge',
        args: ['--disable-blink-features=AutomationControlled']
      });
    } catch (e2) {
      console.log('DEBUG: Edge not found, falling back to bundled Chromium...');
      browser = await chromium.launch({
        headless,
        args: ['--disable-blink-features=AutomationControlled']
      });
    }
  }
  return browser;
}

async function runLike(headless = false, userName: string | null = null) {
  const logger = new Logger(userName, 'like');
  logger.log('Starting runLike');

  const config = loadConfig(userName);
  if (!config.actions || !config.actions.targetKeywords) {
    logger.error('config.jsonにactions設定がありません。');
    await handleChatworkNotification(config, logger);
    return;
  }

  const keywords = config.actions.targetKeywords;
  const limit = config.actions.likeLimit || 5;

  const { sessionPath } = getPaths(userName);
  if (!fs.existsSync(sessionPath)) {
    logger.error(`セッションファイルがありません: ${sessionPath}`);
    logger.error('loginを実行してください。');
    await handleChatworkNotification(config, logger);
    return;
  }

  const browser = await launchBrowser(headless);
  const context = await browser.newContext({
    storageState: sessionPath,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    let count = 0;
    for (const keyword of keywords) {
      if (count >= limit) break;
      logger.log(`Searching for keyword (Like): ${keyword}`);

      await page.goto(`https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=live`);
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `debug_like_search_${keyword}.png` });

      const tweets = page.locator('article[data-testid="tweet"]');
      const tweetCount = await tweets.count();
      logger.log(`  -> Found ${tweetCount} tweets`);

      for (let i = 0; i < tweetCount; i++) {
        if (count >= limit) break;
        const tweet = tweets.nth(i);

        await tweet.scrollIntoViewIfNeeded();

        // すでにいいね済みか確認 (data-testid="unlike" なら済み)
        const unlikeButton = tweet.locator('[data-testid="unlike"]');
        if (await unlikeButton.count() > 0) {
          logger.log('  -> すでにいいね済みです。スキップ');
          continue;
        }

        // いいねボタン (buttonタグとは限らないので汎用的にdata-testidで探す)
        const likeButton = tweet.locator('[data-testid="like"]');
        if (await likeButton.count() > 0) {
          await likeButton.first().click();
          logger.log(`  -> いいねしました (${count + 1}/${limit})`);
          count++;
          const wait = Math.floor(Math.random() * 5000) + 5000;
          logger.log(`     Waiting ${wait / 1000}s...`);
          await page.waitForTimeout(wait);
        } else {
          logger.log('  -> いいねボタンが見つかりませんでした (data-testid="like")');
        }
      }
    }
    logger.log('自動いいね完了しました。');
  } catch (e) {
    logger.error('Error in runLike:', e);
  } finally {
    await browser.close();
    await handleChatworkNotification(config, logger);
  }
}

async function runFollow(headless = false, userName: string | null = null) {
  const logger = new Logger(userName, 'follow');
  logger.log('Starting runFollow');

  const config = loadConfig(userName);
  if (!config.actions || !config.actions.targetKeywords) {
    logger.error('config.jsonにactions設定がありません。');
    await handleChatworkNotification(config, logger);
    return;
  }

  const keywords = config.actions.targetKeywords;
  const limit = config.actions.followLimit || 3;

  const { sessionPath } = getPaths(userName);
  if (!fs.existsSync(sessionPath)) {
    logger.error(`セッションファイルがありません: ${sessionPath}`);
    logger.error('loginを実行してください。');
    await handleChatworkNotification(config, logger);
    return;
  }

  const browser = await launchBrowser(headless);
  const context = await browser.newContext({
    storageState: sessionPath,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    let count = 0;
    for (const keyword of keywords) {
      if (count >= limit) break;
      logger.log(`Searching for keyword (Follow): ${keyword}`);

      await page.goto(`https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=user`);
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `debug_follow_search_${keyword}.png` });

      const users = page.locator('div[data-testid="cellInnerDiv"]');
      const userCount = await users.count();
      logger.log(`  -> Found ${userCount} users`);

      for (let i = 0; i < userCount; i++) {
        if (count >= limit) break;
        const user = users.nth(i);

        await user.scrollIntoViewIfNeeded();

        // フォローボタンを探す
        // 優先: [data-testid$="-follow"] (末尾が -follow)
        // 次点: aria-label に "Follow" または "フォロー" を含むボタン
        let followButton = user.locator('button[data-testid$="-follow"]');
        if (await followButton.count() === 0) {
          followButton = user.locator('button[aria-label*="Follow"], button[aria-label*="フォロー"]');
        }

        if (await followButton.count() > 0) {
          // すでにフォロー済みか確認
          // 優先: [data-testid$="-unfollow"]
          const unfollowButton = user.locator('[data-testid$="-unfollow"]');
          if (await unfollowButton.count() > 0) {
            logger.log('  -> すでにフォロー済みです (testid check)。スキップ');
            continue;
          }

          // 次点: ラベルチェック
          const label = await followButton.first().getAttribute('aria-label');
          logger.log(`    Checking button label: ${label}`);

          if (label && (label.includes('Following') || label.includes('Unfollow') || label.includes('フォロー中') || label.includes('フォロー解除'))) {
            logger.log('  -> すでにフォロー済みです (label check)。スキップ');
            continue;
          }

          try {
            await followButton.first().click();
            logger.log(`  -> フォローしました (${count + 1}/${limit})`);
            count++;
            const wait = Math.floor(Math.random() * 5000) + 5000;
            logger.log(`     Waiting ${wait / 1000}s...`);
            await page.waitForTimeout(wait);
          } catch (err) {
            logger.error('    Click error:', err);
          }
        } else {
          logger.log('  -> フォローボタンが見つかりませんでした');
          // デバッグ用: ボタン要素の属性を出力
          const buttons = user.locator('button');
          const btnCount = await buttons.count();
          for (let b = 0; b < btnCount; b++) {
            const aria = await buttons.nth(b).getAttribute('aria-label');
            const testid = await buttons.nth(b).getAttribute('data-testid');
            logger.log(`    [Debug] Button ${b}: aria-label="${aria}", testid="${testid}"`);
          }
        }
      }
    }
    logger.log('自動フォロー完了しました。');
  } catch (e) {
    logger.error('Error in runFollow:', e);
  } finally {
    await browser.close();
    await handleChatworkNotification(config, logger);
  }
}

// スケジューラ実行
// スケジューラ実行
function runSchedule(userName: string | null = null) {
  const config = loadConfig(userName);
  if (!config.schedules) {
    console.error('設定ファイルに schedules 項目がありません。');
    return;
  }

  console.log(`[Scheduler] ユーザー "${userName || 'default'}" のスケジュール監視を開始します... (Ctrl+C で停止)`);

  // 自動いいね
  if (config.schedules.like) {
    console.log(`[Scheduler] 自動いいね予約: ${config.schedules.like}`);
    cron.schedule(config.schedules.like, () => {
      console.log(`[Scheduler] 自動いいねを実行します... (${new Date().toLocaleString()})`);
      runLike(true, userName).catch(e => console.error(e));
    });
  }

  // 自動フォロー
  if (config.schedules.follow) {
    console.log(`[Scheduler] 自動フォロー予約: ${config.schedules.follow}`);
    cron.schedule(config.schedules.follow, () => {
      console.log(`[Scheduler] 自動フォローを実行します... (${new Date().toLocaleString()})`);
      runFollow(true, userName).catch(e => console.error(e));
    });
  }

  // 自動投稿 (配列対応)
  if (config.schedules.post && Array.isArray(config.schedules.post)) {
    config.schedules.post.forEach(item => {
      if (item.time && item.key) {
        console.log(`[Scheduler] 自動投稿予約 (${item.key}): ${item.time}`);
        cron.schedule(item.time, () => {
          console.log(`[Scheduler] 自動投稿を実行します: ${item.key} (${new Date().toLocaleString()})`);
          // 単発投稿として runBatch を利用 (headless=true)
          runBatch([item.key], true, userName).catch(e => console.error(e));
        });
      }
    });
  }
}

// Chatwork通知ヘルパー
async function handleChatworkNotification(config: any, logger: Logger) {
  logger.log(`DEBUG: Chatwork Config Check: ${JSON.stringify(config.chatwork)}`);

  if (config.chatwork && config.chatwork.apiToken && config.chatwork.roomId) {
    logger.log('Chatworkへログを送信します...');
    const client = new ChatworkClient(config.chatwork.apiToken, config.chatwork.roomId);
    await client.uploadFile(logger.getLogPath(), '実行ログ');
  } else {
    logger.log('Chatwork設定が見つからないため、ログ送信をスキップします。');
  }
}

// メイン
const args = process.argv.slice(2);
const command = args[0];
const isHeadless = args.includes('--headless');

// ユーザー名の取得 (--user または -u)
let userName = null;
const userIndex = args.findIndex(a => a === '--user' || a === '-u');
if (userIndex !== -1 && args[userIndex + 1]) {
  userName = args[userIndex + 1];
}

// 引数からオプションを除去してキーだけにする
const cleanArgs = args.filter((val, index) => {
  // --headless, --user, -u, およびその値を除外
  if (val === '--headless') return false;
  if (val === '--user' || val === '-u') return false;
  // --user/-u の次の要素（値）も除外
  // 注意: filter内ではindexの前後の文脈が見にくいが、
  // ここでは簡易的に「オプション値」として使われたものを除外するロジックが必要。
  // しかし、args自体から検索したインデックスで判定したほうが確実。
  return true;
});

// 正確なキーリストの抽出 (コマンド引数以降で、オプション関連でないもの)
// 上記filterだと値が消せないので、再構築
const keys = [];
for (let i = 1; i < args.length; i++) {
  const val = args[i];
  if (val === '--headless') continue;
  if (val === '--user' || val === '-u') {
    i++; // 次の値もスキップ
    continue;
  }
  keys.push(val);
}

// コマンド実行
(async () => {
  if (command === 'login') {
    await login(userName);
  } else if (command === 'post') {
    if (keys.length === 0) {
      console.error('投稿するパターンキーを指定してください。例: npx tsx src/index.ts post morning --user myaccount');
    } else {
      await runBatch(keys, isHeadless, userName);
    }
  } else if (command === 'like') {
    await runLike(isHeadless, userName);
  } else if (command === 'follow') {
    await runFollow(isHeadless, userName);
  } else if (command === 'schedule') {
    runSchedule(userName);
  } else {
    console.log('npx tsx src/index.ts login [--user name]');
    console.log('npx tsx src/index.ts post [key...] [--user name]');
    console.log('npx tsx src/index.ts like [--user name]');
    console.log('npx tsx src/index.ts follow [--user name]');
    console.log('npx tsx src/index.ts schedule [--user name]');
  }
})();