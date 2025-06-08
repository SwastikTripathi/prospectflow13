'use server';

/**
 * @fileOverview This file contains the Genkit flow for expanding and elaborating on user-entered text.
 *
 * - expandText - A function that takes user input text and returns an expanded version.
 * - ExpandTextInput - The input type for the expandText function.
 * - ExpandTextOutput - The return type for the expandText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExpandTextInputSchema = z.string().describe('The text to be expanded and elaborated upon.');
export type ExpandTextInput = z.infer<typeof ExpandTextInputSchema>;

const ExpandTextOutputSchema = z.string().describe('The expanded and elaborated text.');
export type ExpandTextOutput = z.infer<typeof ExpandTextOutputSchema>;

export async function expandText(input: ExpandTextInput): Promise<ExpandTextOutput> {
  return expandTextFlow(input);
}

const expandTextPrompt = ai.definePrompt({
  name: 'expandTextPrompt',
  input: {schema: ExpandTextInputSchema},
  output: {schema: ExpandTextOutputSchema},
  prompt: `Expand and elaborate on the following text:\n\n{{input}}`,
});

const expandTextFlow = ai.defineFlow(
  {
    name: 'expandTextFlow',
    inputSchema: ExpandTextInputSchema,
    outputSchema: ExpandTextOutputSchema,
  },
  async input => {
    const {text} = await expandTextPrompt(input);
    return text!;
  }
);
