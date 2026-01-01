import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

export class ChatworkClient {
    private apiToken: string;
    private roomId: string;

    constructor(apiToken: string, roomId: string) {
        this.apiToken = apiToken;
        this.roomId = roomId;
    }

    async sendMessage(message: string): Promise<void> {
        try {
            await axios.post(
                `https://api.chatwork.com/v2/rooms/${this.roomId}/messages`,
                `body=${encodeURIComponent(message)}`,
                {
                    headers: {
                        'X-ChatWorkToken': this.apiToken,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );
        } catch (error: any) {
            console.error('Chatwork send message failed:', error.response?.data || error.message);
        }
    }

    async uploadFile(filePath: string, message: string = ''): Promise<void> {
        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return;
        }

        try {
            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));
            form.append('message', message);

            await axios.post(
                `https://api.chatwork.com/v2/rooms/${this.roomId}/files`,
                form,
                {
                    headers: {
                        'X-ChatWorkToken': this.apiToken,
                        ...form.getHeaders(),
                    },
                }
            );
            console.log('Chatwork file upload success.');
        } catch (error: any) {
            console.error('Chatwork file upload failed:', error.response?.data || error.message);
        }
    }
}
