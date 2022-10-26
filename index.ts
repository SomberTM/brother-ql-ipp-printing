import IPP from 'ipp';
import Jimp from 'jimp'
import PDFDocument from 'pdfkit';
import concat from 'concat-stream';
import fs from 'fs';

const PrinterInfo = {
    ip: '192.168.1.43',
    uri: 'http://192.168.1.43:631/ipp/print',
};

class Raster {

    public readonly data: Buffer[] = [];

    constructor() { }

    public addInvalidate() { this.data.push(Buffer.alloc(400)) }
    public addInitialize() { this.data.push(Buffer.from([0x1b, 0x40])) }
    public addSwitchMode() { this.data.push(Buffer.from([0x1b, 0x69, 0x61, 0x01])) }
    public addStatusNotification() { this.data.push(Buffer.from([0x1b, 0x69, 0x21, 0x00])) }
    public addMediaType() { this.data.push(Buffer.from([0x1b, 0x69, 0x7a, 0x8f, 0x0b, 0x1d, 0x5a, 0xdf, 0x03, 0x00, 0x00, 0x00, 0x00])) }
    public addAutoCut() { this.data.push(Buffer.from([0x1b, 0x69, 0x4d, 0x40])); }
    public addExpandedMode() { this.data.push(Buffer.from([0x1b, 0x69, 0x41, 0x01])); }
    public addCutAtEnd() { this.data.push(Buffer.from([0x1b, 0x69, 0x4b, 0x08])); }
    public addMargins() { this.data.push(Buffer.from([0x1b, 0x69, 0x64, 0x23, 0x00])); }
    public addCompression() { this.data.push(Buffer.from([0x4d, 0x00])) }
    public addPrintData(blackWhiteImageBuffer: Buffer): void;
    public async addPrintData(imageLocation: string): Promise<void>;
    public async addPrintData(image: Buffer | string): Promise<void>{
        return new Promise(async (resolve, reject) => {
            if (typeof image === 'string') {
                const img = await Jimp.read(image);
                img.greyscale().contrast(1)  
                for (let y = 0; y < img.bitmap.height; y++) {
                    let row = Buffer.alloc(93);
                    row[0] = 0x67;
                    row[1] = 0x00;
                    row[2] = 0x5A;
                    for (let x = 0; x < img.bitmap.width; x++) {
                        if (img.getPixelColor(x, y) == 255) {
                            let byteNum = 93 - Math.floor((x / 8) + 3);
                            let bitOffset = x % 8;
                            row[byteNum] |= 1 << bitOffset;
                        }
                    }
                    this.data.push(row);
                }
                
                resolve();
            } else {
                reject("Not implemented");
            }
        })
        
    }
    public addEndLabel() { this.data.push(Buffer.from([0x1A])) }

    public addAll(): void {
        this.addInvalidate();
        this.addInitialize();
        this.addSwitchMode();
        this.addStatusNotification();
        this.addMediaType();
        this.addAutoCut();
        this.addExpandedMode();
        this.addCutAtEnd();
        this.addMargins();
        this.addMargins();
    }

    public get() { 
        this.addEndLabel();
        return Buffer.concat(this.data); 
    }

}

class Printer extends IPP.Printer {

    async executeAsync(operation: IPP.PrinterOpertaion, request: IPP.FullRequest): Promise<IPP.FullResponse> {
        return new Promise((resolve, reject) => {
            this.execute(operation, request, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    }

    async getAttributes(): Promise<IPP.GetPrinterAttributesResponse> {
        return <IPP.GetPrinterAttributesResponse> (await this.executeAsync('Get-Printer-Attributes', {
            'operation-attributes-tag': {
                "attributes-charset": "utf-8",
                "requesting-user-name": "class"
            }
        }));
    }

    async print(data: Buffer): Promise<IPP.PrintJobResponse> {
        return <IPP.PrintJobResponse> (await this.executeAsync('Print-Job', {
            'operation-attributes-tag': {
                'attributes-charset': 'utf-8',
                'job-name': 'test',
                'requesting-user-name': 'class',
                'document-format': 'application/octet-stream',
            },
            'job-attributes-tag': {
                'orientation-requested': 'landscape'
            },
            'data': data
        }));
    }

    async getJobs(): Promise<IPP.GetJobsResponse> {
        return <IPP.GetJobsResponse> (await this.executeAsync('Get-Jobs', {
            'operation-attributes-tag': {
                'requesting-user-name': 'class',
            }
        }));
    }

    async cancelAllJobs(): Promise<IPP.FullResponse | null> {
        const jobs = await this.getJobs();
        var response: IPP.FullResponse | null = null;

        if (jobs['job-attributes-tag']) {
            if (Array.isArray(jobs['job-attributes-tag'])) {
                for (const job of jobs['job-attributes-tag']) {
                    response = await this.executeAsync('Cancel-Job', {
                        'operation-attributes-tag': {
                            'requesting-user-name': 'class',
                            // @ts-ignore
                            'job-id': job['job-id']
                        }
                    });
                }
            } else {
                response = await this.executeAsync('Cancel-Job', {
                    'operation-attributes-tag': {
                        'requesting-user-name': 'class',
                        // @ts-ignore
                        'job-id': jobs['job-attributes-tag']['job-id']
                    }
                });
            }
        }

        return response;
    }

}

async function wait(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

(async function() {
    const printer: Printer = new Printer(PrinterInfo.uri);
    
    console.log(await printer.cancelAllJobs());
    
    const raster = new Raster();
    raster.addAll();
    await raster.addPrintData('label_bw.png');
    const data = raster.get();

    console.log(data)
    console.log(await printer.print(data));
    await wait(2000);
    console.log(await printer.cancelAllJobs());

    // console.log(await printer.getJobs());


    // const pdf: PDFKit.PDFDocument = new PDFDocument({ margin: 0 });
    // pdf.text('Hello World!', 10, 10);

    // pdf.pipe(concat(async (data: Buffer) => {
    //     const res = await printer.print(data);
    //     console.log(res);
    // }));

    // pdf.end();
    
})();