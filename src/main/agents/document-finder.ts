import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

interface DocumentResult {
  path: string
  name: string
  kind: string
  lastModified: Date
}

/**
 * Find documents related to a meeting or topic using Spotlight (mdfind)
 */
export async function findRelatedDocuments(query: string, limit = 10): Promise<DocumentResult[]> {
  const searchTerms = query.split(' ').filter(term => term.length > 2)
  const spotlightQuery = searchTerms.map(term => `kMDItemTextContent == "*${term}*"cd`).join(' || ')

  try {
    // Search for documents, presentations, and spreadsheets
    const { stdout } = await execAsync(
      `mdfind '(${spotlightQuery}) && (kMDItemKind == "PDF Document" || kMDItemKind == "Presentation" || kMDItemKind == "Spreadsheet" || kMDItemKind == "Document" || kMDItemKind == "Google Doc" || kMDItemKind == "Text")' | head -${limit}`,
      { maxBuffer: 1024 * 1024 }
    )

    const paths = stdout.trim().split('\n').filter(p => p.length > 0)
    const results: DocumentResult[] = []

    for (const filePath of paths) {
      try {
        const { stdout: mdls } = await execAsync(
          `mdls -name kMDItemKind -name kMDItemContentModificationDate "${filePath}"`
        )

        const kindMatch = mdls.match(/kMDItemKind\s*=\s*"(.+)"/)
        const dateMatch = mdls.match(/kMDItemContentModificationDate\s*=\s*(.+)/)

        results.push({
          path: filePath,
          name: path.basename(filePath),
          kind: kindMatch ? kindMatch[1] : 'Unknown',
          lastModified: dateMatch ? new Date(dateMatch[1]) : new Date(),
        })
      } catch {
        // Skip files we can't get metadata for
      }
    }

    // Sort by recency
    return results.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
  } catch (error) {
    console.error('Document search failed:', error)
    return []
  }
}

/**
 * Find documents by attendee name (useful for meeting prep)
 */
export async function findDocumentsByPerson(name: string, limit = 10): Promise<DocumentResult[]> {
  try {
    // Search for documents containing the person's name
    const { stdout } = await execAsync(
      `mdfind 'kMDItemTextContent == "*${name}*"cd && (kMDItemKind == "PDF Document" || kMDItemKind == "Presentation" || kMDItemKind == "Document" || kMDItemKind == "Email Message")' | head -${limit}`,
      { maxBuffer: 1024 * 1024 }
    )

    const paths = stdout.trim().split('\n').filter(p => p.length > 0)
    const results: DocumentResult[] = []

    for (const filePath of paths) {
      results.push({
        path: filePath,
        name: path.basename(filePath),
        kind: 'Document',
        lastModified: new Date(),
      })
    }

    return results
  } catch (error) {
    console.error('Person document search failed:', error)
    return []
  }
}

/**
 * Find recently accessed documents
 */
export async function findRecentDocuments(limit = 10): Promise<DocumentResult[]> {
  try {
    const { stdout } = await execAsync(
      `mdfind 'kMDItemLastUsedDate >= $time.today(-7) && (kMDItemKind == "PDF Document" || kMDItemKind == "Presentation" || kMDItemKind == "Spreadsheet" || kMDItemKind == "Document")' | head -${limit}`,
      { maxBuffer: 1024 * 1024 }
    )

    const paths = stdout.trim().split('\n').filter(p => p.length > 0)
    const results: DocumentResult[] = []

    for (const filePath of paths) {
      results.push({
        path: filePath,
        name: path.basename(filePath),
        kind: 'Document',
        lastModified: new Date(),
      })
    }

    return results
  } catch (error) {
    console.error('Recent documents search failed:', error)
    return []
  }
}

/**
 * Open a document in its default application
 */
export async function openDocument(filePath: string): Promise<void> {
  await execAsync(`open "${filePath}"`)
}

/**
 * Simple file search by name using Spotlight
 */
export async function searchLocalFiles(query: string, limit = 10): Promise<{ name: string; path: string; source: 'local' }[]> {
  try {
    const { stdout } = await execAsync(
      `mdfind "kMDItemDisplayName == '*${query}*'wc" | head -${limit}`,
      { maxBuffer: 1024 * 1024 }
    )
    return stdout.trim().split('\n').filter(Boolean).map(filePath => ({
      name: path.basename(filePath),
      path: filePath,
      source: 'local' as const,
    }))
  } catch {
    return []
  }
}

/**
 * Find documents relevant to a meeting based on title and attendees
 */
export async function findRelevantDocumentsForMeeting(
  title: string,
  attendees: string[]
): Promise<{ name: string; path: string; source: 'local' }[]> {
  const terms = [title, ...attendees.map(a => a.split('@')[0])].slice(0, 5)
  const allDocs: { name: string; path: string; source: 'local' }[] = []

  for (const term of terms) {
    if (term.length < 3) continue
    const docs = await searchLocalFiles(term, 5)
    allDocs.push(...docs)
  }

  // Deduplicate
  const seen = new Set<string>()
  return allDocs.filter(d => {
    if (seen.has(d.path)) return false
    seen.add(d.path)
    return true
  }).slice(0, 10)
}
