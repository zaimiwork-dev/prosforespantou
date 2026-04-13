import { NextResponse } from 'next/server';
import { aiExtractionArraySchema } from '@/lib/validations/ai-extraction';

export async function POST(req) {
  try {
    const body = await req.json();
    
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message || 'Groq API Error' }, 
        { status: res.status }
      );
    }

    // Extract raw string content from AI
    const rawContent = data.choices?.[0]?.message?.content || '{}';
    
    try {
      // Parse JSON from content
      const parsedJson = JSON.parse(rawContent);
      
      // Look for array within JSON (extractedArray logic from frontend moved here)
      let rawArray = Array.isArray(parsedJson) 
        ? parsedJson 
        : (parsedJson.discounts || parsedJson.offers || Object.values(parsedJson).find(v => Array.isArray(v)) || [parsedJson]);

      // STRIKT VALIDATION with Zod
      const validatedDeals = aiExtractionArraySchema.parse(rawArray);
      
      // Return validated data to frontend
      return NextResponse.json({
        success: true,
        data: validatedDeals
      });
      
    } catch (parseError) {
      console.error("AI Response Parsing/Validation Error:", parseError);
      return NextResponse.json(
        { error: "AI output validation failed: " + parseError.message }, 
        { status: 422 }
      );
    }
    
  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}
