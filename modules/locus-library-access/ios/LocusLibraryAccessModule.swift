import ExpoModulesCore
import Foundation
import NaturalLanguage

public class LocusLibraryAccessModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LocusLibraryAccess")

    Function("bookmarkFolder") { (uri: String) -> String? in
      guard let url = URL(string: uri) else { return nil }
      
      // We must start accessing to create a bookmark if it's security-scoped
      let accessed = url.startAccessingSecurityScopedResource()
      defer { if accessed { url.stopAccessingSecurityScopedResource() } }
      
      do {
        let bookmark = try url.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
        return bookmark.base64EncodedString()
      } catch {
        print("LocusLibraryAccess: Error creating bookmark: \(error)")
        return nil
      }
    }

    Function("resolveBookmark") { (base64: String) -> String? in
      guard let data = Data(base64Encoded: base64) else { return nil }
      
      do {
        var isStale = false
        let url = try URL(resolvingBookmarkData: data, options: .withoutUI, relativeTo: nil, bookmarkDataIsStale: &isStale)
        
        // Start accessing the resource. We deliberately do NOT stop accessing it,
        // so that the rest of the app (like expo-file-system) can use the string URI
        // to read/write files for the duration of the app session.
        _ = url.startAccessingSecurityScopedResource()
        
        return url.absoluteString
      } catch {
        print("LocusLibraryAccess: Error resolving bookmark: \(error)")
        return nil
      }
    }

    Function("extractEntitiesAndTags") { (text: String) -> [String] in
      guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return []
      }

      var extracted = Set<String>()
      let tagger = NLTagger(tagSchemes: [.nameType, .lexicalClass])
      tagger.string = text

      let options: NLTagger.Options = [.omitPunctuation, .omitWhitespace, .joinNames]

      // 1. Named Entities (Organizations, Places, Personal Names)
      let entityTags: Set<NLTag> = [.organizationName, .placeName, .personalName]
      tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType, options: options) { tag, tokenRange in
        if let tag = tag, entityTags.contains(tag) {
          let word = String(text[tokenRange])
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
          if word.count >= 2 && word.count <= 35 {
            extracted.insert(word)
          }
        }
        return true
      }

      return Array(extracted)
    }
  }
}
