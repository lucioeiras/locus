import AppIntents
import Foundation

@available(iOS 18.0, *)
protocol AddItemControlIntent: ControlConfigurationIntent {
  static var item: String? { get }
}

@available(iOS 18.0, *)
extension AddItemControlIntent {
  @MainActor
  func perform() async throws -> some IntentResult {
    let item = Self.item ?? "all"
    let request = "\(item)|\(UUID().uuidString)"
    UserDefaults(suiteName: "group.com.diegoeiras.locus")?.set(request, forKey: "pendingControlAdd")
    return .result()
  }
}

@available(iOS 18.0, *)
struct AddLocusIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add to Locus"
  static let description = IntentDescription(stringLiteral: "Open the add screen.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = nil
}

@available(iOS 18.0, *)
struct AddNoteIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add a note"
  static let description = IntentDescription(stringLiteral: "Create a note, quote, or to-do.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "note"
}

@available(iOS 18.0, *)
struct AddLinkIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add a link"
  static let description = IntentDescription(stringLiteral: "Save a link.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "link"
}

@available(iOS 18.0, *)
struct AddPDFIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add a PDF"
  static let description = IntentDescription(stringLiteral: "Choose a PDF to save.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "pdf"
}

@available(iOS 18.0, *)
struct AddImageIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add an image"
  static let description = IntentDescription(stringLiteral: "Choose an image to save.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "image"
}

@available(iOS 18.0, *)
struct AddBookIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add a book"
  static let description = IntentDescription(stringLiteral: "Add a book to your library.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "book"
}

@available(iOS 18.0, *)
struct AddMusicIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add music"
  static let description = IntentDescription(stringLiteral: "Save a song or album.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "music"
}

@available(iOS 18.0, *)
struct AddMovieIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add a movie"
  static let description = IntentDescription(stringLiteral: "Save a movie.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "movie"
}

@available(iOS 18.0, *)
struct AddGameIntent: AddItemControlIntent {
  static let title: LocalizedStringResource = "Add a game"
  static let description = IntentDescription(stringLiteral: "Save a game.")
  static let openAppWhenRun = true
  static let isDiscoverable = true
  static let item: String? = "game"
}
