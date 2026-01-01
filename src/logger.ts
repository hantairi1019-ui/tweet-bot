import fs from 'fs';
import path from 'path';

export class Logger {
    private logPath: string;

    constructor(userName: string | null = null, action: string = 'system') {
        const logDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const userSuffix = userName ? `_${userName}` : '_system';
        const fileName = `${dateStr}_${timeStr}_${action}${userSuffix}.log`;
        this.logPath = path.join(logDir, fileName);
    }

    public log(message: string) {
        const timestamp = new Date().toLocaleString();
        const formattedMessage = `[${timestamp}] ${message}`;

        // コンソール出力
        console.log(formattedMessage);

        // ファイル追記
        try {
            fs.appendFileSync(this.logPath, formattedMessage + '\n', 'utf8');
        } catch (e) {
            console.error('Failed to write log file:', e);
        }
    }

    public error(message: string, error?: any) {
        const timestamp = new Date().toLocaleString();
        let formattedMessage = `[${timestamp}] [ERROR] ${message}`;
        if (error) {
            formattedMessage += `\n${JSON.stringify(error, Object.getOwnPropertyNames(error))}`;
        }

        console.error(formattedMessage);

        try {
            fs.appendFileSync(this.logPath, formattedMessage + '\n', 'utf8');
        } catch (e) {
            console.error('Failed to write log file:', e);
        }
    }

    public getLogPath(): string {
        return this.logPath;
    }
}
