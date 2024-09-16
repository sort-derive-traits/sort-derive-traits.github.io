// Function to sort the derive traits based on the selected sorting type
function sortTraits() {
    const inputText = document.getElementById('input-field').value;
    const sortType = document.getElementById('sort-type').value;

    let strategy;
    if (sortType.toLowerCase().includes('alphabetical')) {
        strategy = 'AlphabeticalSort';
    } else if (sortType.toLowerCase().includes('canonical')) {
        strategy = 'CanonicalSort';
    } else {
        strategy = null;  // No sorting if no valid strategy is provided
    }

    const outputText = processText(inputText, strategy);

    const outputField = document.getElementById('output-field');
    outputField.textContent = outputText;

    Prism.highlightAll();  // Re-highlight after updating the output
}

function copyCode() {
    const outputField = document.getElementById('output-field');
    const textToCopy = outputField.textContent;

    // Create a temporary textarea element to copy the text
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = textToCopy;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    document.execCommand('copy');
    document.body.removeChild(tempTextArea);

    // Show 'Copied!' for 3 seconds
    const copyButton = document.getElementById('copy-btn');
    copyButton.textContent = 'Copied!';
    copyButton.classList.add('copied');

    setTimeout(() => {
        copyButton.textContent = 'Copy code';
        copyButton.classList.remove('copied');
    }, 3000);
}

function processText(text, strategy) {
    const endsWithNewline = text.endsWith('\n');
    if (!endsWithNewline) {
        // Add a newline to the text if it doesn't already have one
        text += '\n';
    }

    const lines = text.split(/(?<=\n)/);
    const output = processLines(lines, strategy);

    let result = output.join('');
    // Handle whether the result should end with a newline based on the original input
    if (!endsWithNewline) {
        // If the original text didn't end with a newline, remove any trailing newline in the result
        result = result.replace(/\n$/, '');
    }

    return result;
}

function re_derive_begin() {
    if (!re_derive_begin.regex) {
        re_derive_begin.regex = new RegExp("^\\s*#\\[derive\\(");
    }
    return re_derive_begin.regex;
}

function re_derive_end() {
    if (!re_derive_end.regex) {
        re_derive_end.regex = new RegExp("\\)\\]\\s*$");
    }
    return re_derive_end.regex;
}

function processLines(lines, strategy) {
    let outputLines = [];
    let block = [];
    let isSortingBlock = false;

    const reDeriveBegin = re_derive_begin();
    const reDeriveEnd = re_derive_end();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let isDeriveBegin = false;

        if (reDeriveBegin.test(line)) {
            isDeriveBegin = true;
            isSortingBlock = true;
            block.push(line);
        }

        // Remove comments from the line and trim the result
        const lineWithoutComment = line.trim().split('//')[0].trim();

        // If we're in a sorting block and this line is the end of the block
        if (isSortingBlock && reDeriveEnd.test(lineWithoutComment)) {
            if (!isDeriveBegin) {
                block.push(line);
            }

            // Sort the block according to the strategy and append to output
            block = sort(block, strategy);
            isSortingBlock = false;
            outputLines.push(...block);
            block = [];  // Reset block for the next possible derive block

        } else if (isSortingBlock) {
            // If inside the derive block but it's not the start line, add it to the block
            if (!isDeriveBegin) {
                block.push(line);
            }
        } else {
            // If not inside a sorting block, just append the line to output
            outputLines.push(line);
        }
    }

    // If the file ends while still inside a derive block, sort and append the remaining block
    if (isSortingBlock) {
        block = sort(block, strategy);
        outputLines.push(...block);
    }

    return outputLines;
}

function sort(block, strategy) {
    // Join the block into a single string (removing trailing newlines from each line)
    let line = block.map(line => line.trimEnd()).join('') + '\n';

    // Remove comments from the line and trim it
    const lineWithoutComment = line.trim().split('//')[0].trim();

    // Check if the line contains #[derive(...)]
    const deriveStartIndex = lineWithoutComment.indexOf('#[derive(');
    if (deriveStartIndex !== -1) {
        const deriveEndIndex = lineWithoutComment.indexOf(')]', deriveStartIndex);
        if (deriveEndIndex !== -1) {
            // Extract the derive content (the part inside #[derive(...)]
            const deriveContent = lineWithoutComment.slice(deriveStartIndex + 9, deriveEndIndex);

            // Split and clean up the traits inside #[derive(...)]
            let traits = deriveContent.split(',').map(t => t.trim()).filter(t => t.length > 0);

            // Sort the traits based on the strategy
            if (strategy === 'AlphabeticalSort') {
                traits = alphabeticalSort(traits);
            } else if (strategy === 'CanonicalSort') {
                traits = canonicalSort(traits);
            } else {
                return block;
            }

            // Rebuild the #[derive(...)] line with sorted traits
            const sortedTraits = traits.join(', ');
            const newDerive = `#[derive(${sortedTraits})]`;

            // Preserve the prefix and suffix whitespace
            const prefixWhitespace = line.slice(0, line.indexOf(lineWithoutComment));
            const suffixWhitespace = line.slice(line.indexOf(lineWithoutComment) + lineWithoutComment.length);

            const newLine = `${prefixWhitespace}${newDerive}${suffixWhitespace}`;

            // Constants for determining if the new line should stay on one line or break into multiple lines
            const STAY_ONE_LINE_LEN = 80; // Example length for one-line condition
            const BREAK_INTO_MANY_LINES_LEN = 120; // Example length for breaking into multiple lines

            if (newLine.length <= STAY_ONE_LINE_LEN) {
                return [newLine];
            }

            const midLine = `${prefixWhitespace}    ${sortedTraits},`;
            let result = [`${prefixWhitespace}#[derive(\n`];

            if (midLine.length <= BREAK_INTO_MANY_LINES_LEN) {
                result.push(`${midLine}\n${prefixWhitespace})]\n`);
            } else {
                traits.forEach(traitItem => {
                    result.push(`${prefixWhitespace}    ${traitItem},\n`);
                });
                result.push(`${prefixWhitespace})]\n`);
            }

            return result;
        }
    }

    // Return the original block if it doesn't contain #[derive(...)]
    return block;
}

const extractLastToken = s => s.split("::").pop() || s;

function prioritySort(traits, priorityOrder) {
    const priorityIndex = new Map(priorityOrder.map((trait, index) => [trait, index]));

    // Sort traits by canonical index, and by trait name if indices are the same
    return traits.sort((a, b) => {
        const indexA = priorityIndex.get(a) !== undefined ? priorityIndex.get(a) : Number.MAX_SAFE_INTEGER;
        const indexB = priorityIndex.get(b) !== undefined ? priorityIndex.get(b) : Number.MAX_SAFE_INTEGER;

        // First, compare by priority index
        if (indexA !== indexB) {
            return indexA - indexB;
        }

        // Compare by the last token, case-sensitive
        const lastTokenA = extractLastToken(a);
        const lastTokenB = extractLastToken(b);

        if (lastTokenA < lastTokenB) return -1;
        if (lastTokenA > lastTokenB) return 1;

        // Finally, compare the full strings, case-sensitive
        if (a < b) return -1;
        if (a > b) return 1;

        return 0;
    });
}

function canonicalSort(traits) {
    return prioritySort(
        traits,
        // Define the canonical order of traits
        [
            "Copy",
            "Clone",
            "Eq",
            "PartialEq",
            "Ord",
            "PartialOrd",
            "Hash",
            "Debug",
            "Display",
            "Default"
        ]);
}

function alphabeticalSort(traits) {
    return prioritySort(traits, []);
}

module.exports = {
    processText,
    canonicalSort,
    alphabeticalSort
};
