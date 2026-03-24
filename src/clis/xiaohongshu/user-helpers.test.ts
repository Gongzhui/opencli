import { describe, expect, it } from 'vitest';
import {
  buildXhsNoteUrl,
  extractXhsFavoriteNotes,
  extractXhsUserNotes,
  flattenXhsNoteGroups,
  getXhsCollectionNoteGroup,
  normalizeXhsUserId,
} from './user-helpers.js';

describe('normalizeXhsUserId', () => {
  it('extracts the profile id from a full Xiaohongshu URL', () => {
    expect(
      normalizeXhsUserId(
        'https://www.xiaohongshu.com/user/profile/615529370000000002026001?xsec_source=pc_search'
      )
    ).toBe('615529370000000002026001');
  });

  it('keeps a bare profile id unchanged', () => {
    expect(normalizeXhsUserId('615529370000000002026001')).toBe('615529370000000002026001');
  });
});

describe('flattenXhsNoteGroups', () => {
  it('flattens grouped note arrays and ignores empty groups', () => {
    expect(flattenXhsNoteGroups([[{ id: 'a' }], [], null, [{ id: 'b' }]])).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
  });
});

describe('buildXhsNoteUrl', () => {
  it('includes xsec token when available', () => {
    expect(buildXhsNoteUrl('user123', 'note456', 'token789')).toBe(
      'https://www.xiaohongshu.com/user/profile/user123/note456?xsec_token=token789&xsec_source=pc_user'
    );
  });
});

describe('getXhsCollectionNoteGroup', () => {
  it('returns only the note collection bucket from the grouped profile state', () => {
    expect(getXhsCollectionNoteGroup([[{ id: 'user-note' }], [{ id: 'fav-note' }], [{ id: 'board' }]])).toEqual([
      { id: 'fav-note' },
    ]);
  });
});

describe('extractXhsUserNotes', () => {
  it('normalizes grouped note cards into CLI rows', () => {
    const rows = extractXhsUserNotes(
      {
        noteGroups: [
          [
            {
              id: 'note-1',
              xsecToken: 'abc',
              noteCard: {
                noteId: 'note-1',
                displayTitle: 'First note',
                type: 'video',
                interactInfo: { likedCount: '4.6万' },
                user: { userId: 'user-1' },
              },
            },
            {
              noteCard: {
                note_id: 'note-2',
                display_title: 'Second note',
                type: 'normal',
                interact_info: { liked_count: 42 },
              },
            },
          ],
          [],
        ],
      },
      'fallback-user'
    );

    expect(rows).toEqual([
      {
        id: 'note-1',
        title: 'First note',
        type: 'video',
        likes: '4.6万',
        url: 'https://www.xiaohongshu.com/user/profile/user-1/note-1?xsec_token=abc&xsec_source=pc_user',
      },
      {
        id: 'note-2',
        title: 'Second note',
        type: 'normal',
        likes: '42',
        url: 'https://www.xiaohongshu.com/user/profile/fallback-user/note-2',
      },
    ]);
  });

  it('deduplicates repeated notes by note id', () => {
    const rows = extractXhsUserNotes(
      {
        noteGroups: [
          [
            { noteCard: { noteId: 'dup-1', displayTitle: 'keep me' } },
            { noteCard: { noteId: 'dup-1', displayTitle: 'drop me' } },
          ],
        ],
      },
      'fallback-user'
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('keep me');
  });
});

describe('extractXhsFavoriteNotes', () => {
  it('extracts only favorite note rows from the collection note group', () => {
    const rows = extractXhsFavoriteNotes(
      {
        noteGroups: [
          [
            { noteCard: { noteId: 'user-note', displayTitle: 'Own note' } },
          ],
          [
            {
              id: 'fav-1',
              xsecToken: 'fav-token',
              noteCard: {
                noteId: 'fav-1',
                displayTitle: 'Saved note',
                type: 'normal',
                interactInfo: { likedCount: '99' },
                user: { nickname: 'Author A', userId: 'author-a' },
              },
            },
          ],
          [
            { id: 'board-1', name: '专辑' },
          ],
        ],
      },
      'fallback-user'
    );

    expect(rows).toEqual([
      {
        id: 'fav-1',
        title: 'Saved note',
        author: 'Author A',
        type: 'normal',
        likes: '99',
        url: 'https://www.xiaohongshu.com/user/profile/author-a/fav-1?xsec_token=fav-token&xsec_source=pc_user',
      },
    ]);
  });
});
