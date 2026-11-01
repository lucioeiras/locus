import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
protocol AddItemControl: ControlWidget {
  associatedtype Action: AppIntent
  static var kind: String { get }
  static var title: LocalizedStringResource { get }
  static var symbol: String { get }
  static func makeAction() -> Action
}

@available(iOS 18.0, *)
extension AddItemControl {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: Self.kind) {
      ControlWidgetButton(action: Self.makeAction()) {
        Label {
          Text(Self.title)
        } icon: {
          Image(systemName: Self.symbol)
        }
      }
    }
    .displayName(Self.title)
    .description("Open Locus and add this item.")
  }
}

@available(iOS 18.0, *)
struct AddLocusControl: AddItemControl {
  static let kind = "add-locus"
  static let title: LocalizedStringResource = "Add to Locus"
  static let symbol = "plus"
  static func makeAction() -> AddLocusIntent { AddLocusIntent() }
}

@available(iOS 18.0, *)
struct AddNoteControl: AddItemControl {
  static let kind = "add-note"
  static let title: LocalizedStringResource = "Note, quote or to-do"
  static let symbol = "note.text"
  static func makeAction() -> AddNoteIntent { AddNoteIntent() }
}

@available(iOS 18.0, *)
struct AddLinkControl: AddItemControl {
  static let kind = "add-link"
  static let title: LocalizedStringResource = "Link"
  static let symbol = "link"
  static func makeAction() -> AddLinkIntent { AddLinkIntent() }
}

@available(iOS 18.0, *)
struct AddPDFControl: AddItemControl {
  static let kind = "add-pdf"
  static let title: LocalizedStringResource = "PDF"
  static let symbol = "doc.text"
  static func makeAction() -> AddPDFIntent { AddPDFIntent() }
}

@available(iOS 18.0, *)
struct AddImageControl: AddItemControl {
  static let kind = "add-image"
  static let title: LocalizedStringResource = "Image"
  static let symbol = "photo"
  static func makeAction() -> AddImageIntent { AddImageIntent() }
}

@available(iOS 18.0, *)
struct AddBookControl: AddItemControl {
  static let kind = "add-book"
  static let title: LocalizedStringResource = "Book"
  static let symbol = "book"
  static func makeAction() -> AddBookIntent { AddBookIntent() }
}

@available(iOS 18.0, *)
struct AddMusicControl: AddItemControl {
  static let kind = "add-music"
  static let title: LocalizedStringResource = "Music"
  static let symbol = "music.note"
  static func makeAction() -> AddMusicIntent { AddMusicIntent() }
}

@available(iOS 18.0, *)
struct AddMovieControl: AddItemControl {
  static let kind = "add-movie"
  static let title: LocalizedStringResource = "Movie"
  static let symbol = "film"
  static func makeAction() -> AddMovieIntent { AddMovieIntent() }
}

@available(iOS 18.0, *)
struct AddGameControl: AddItemControl {
  static let kind = "add-game"
  static let title: LocalizedStringResource = "Game"
  static let symbol = "gamecontroller"
  static func makeAction() -> AddGameIntent { AddGameIntent() }
}

@available(iOS 18.0, *)
@main
struct LocusControls: WidgetBundle {
  var body: some Widget {
    AddLocusControl()
    AddNoteControl()
    AddLinkControl()
    AddPDFControl()
    AddImageControl()
    AddBookControl()
    AddMusicControl()
    AddMovieControl()
    AddGameControl()
  }
}
