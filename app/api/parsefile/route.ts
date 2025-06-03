// app/api/parsefile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
// import pdf from 'pdf-parse'; // Dynamic import below
import formidable from 'formidable';
import fs from 'fs';

// REMOVED: Deprecated config export
// export const config = {
//   api: {
//     bodyParser: false, 
//   },
// };

// Helper function to parse the form data
const parseForm = (req: NextRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
  return new Promise((resolve, reject) => {
    const form = formidable({});
    // Adapt NextRequest for formidable
    // formidable expects a Node.js IncomingMessage. We cast to `any` to attach properties
    // that formidable might look for. The core part is that formidable can read from the stream.
    const reqAsAny = req as any;
    
    // formidable v3+ might not need these workarounds if it can handle Web Streams directly,
    // but older versions or certain internal checks might benefit from them.
    // For modern Next.js, req.body is a ReadableStream.
    // If formidable has issues, one might need to pipe req.body to a PassThrough stream
    // that then gets passed to form.parse(), but let's try direct first.
    // The key is that Next.js App Router doesn't consume the body by default.

    form.parse(reqAsAny, (err, fields, files) => {
      if (err) {
        console.error('Error parsing form data with formidable:', err);
        return reject(err);
      }
      resolve({ fields, files });
    });
  });
};


export async function POST(req: NextRequest) {
  try {
    const { files } = await parseForm(req);
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!uploadedFile) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const filePath = uploadedFile.filepath;
    const originalFilename = uploadedFile.originalFilename || 'uploaded_file';
    const mimeType = uploadedFile.mimetype;

    let extractedText = '';

    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || originalFilename.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (mimeType === 'application/pdf' || originalFilename.endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(filePath);
      const pdf = (await import("pdf-parse")).default;
      const data = await pdf(dataBuffer);
      extractedText = data.text;
    } else if (mimeType === 'text/plain' || originalFilename.endsWith('.txt')) {
      extractedText = fs.readFileSync(filePath, 'utf8');
    }
    else {
      fs.unlinkSync(filePath); // Clean up temp file
      return NextResponse.json({ error: `Unsupported file type: ${mimeType || 'unknown'}. Please upload .txt, .pdf, or .docx.` }, { status: 400 });
    }

    fs.unlinkSync(filePath); // Clean up temp file after processing

    if (!extractedText.trim()) {
        return NextResponse.json({ error: 'Could not extract text from the file or the file is empty.' }, { status:400 });
    }

    return NextResponse.json({ extractedText });

  } catch (error) {
    console.error('File parsing API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during file parsing.';
    return NextResponse.json({ error: `Failed to parse file: ${errorMessage}` }, { status: 500 });
  }
}

