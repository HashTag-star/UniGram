"""
Refactor: Extract FeedPost component from FeedScreen.tsx into components/FeedPost.tsx
to break circular dependency cycles.

Original file analysis (0-indexed):
  index 0..64   : import statements (last import at index 64)
  index 65      : blank line
  index 66      : const { width, height: screenHeight } = Dimensions.get('window');
  index 67      : blank line
  index 68..133 : helpers (timeAgo, types, fmtCount)
  index 134..149: module-level cache vars
  index 150..176: ThreadTextCard
  index 177..753: Story components (LiveStoryBubble...StoryViewer)
  index 754..2057: FeedPost components (ReelVideoLayer...FeedPost)
  index 2058+   : ReelStripRow, SuggestionCard, FeedScreen, StyleSheets
"""

with open('screens/FeedScreen.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Verify boundaries by checking content
assert 'PopupButton' in lines[64], f"Expected last import at 64, got: {lines[64][:60]}"
assert 'width' in lines[66], f"Expected const{{width}} at 66, got: {lines[66][:60]}"
assert 'timeAgo' in lines[68], f"Expected timeAgo at 68, got: {lines[68][:60]}"
assert 'cachedFeedPosts' in lines[133], f"Expected cache at 133, got: {lines[133][:60]}"
assert 'Thread Text Card' in lines[149], f"Expected Thread Text Card at 149, got: {lines[149][:60]}"
assert 'Live Story Bubble' in lines[176], f"Expected Live Story Bubble at 176, got: {lines[176][:60]}"
assert 'Reel Preview' in lines[752], f"Expected Reel Preview at 752, got: {lines[752][:60]}"
assert 'Reel Strip Row' in lines[2058], f"Expected Reel Strip Row at 2058, got: {lines[2058][:60]}"
print("All boundary assertions passed!")

# Slices (all 0-indexed, right-exclusive)
imports_block    = lines[0:65]           # pure import statements
width_dims_block = lines[65:68]          # blank + const{width} + blank
helpers_block    = lines[68:133]         # timeAgo, interfaces, fmtCount
cache_block      = lines[133:149]        # module-level cache vars
thread_block     = lines[149:176]        # ThreadTextCard component
story_block      = lines[176:753]        # Story UI components
fp_block         = lines[753:2059]       # FeedPost and its sub-components
rest_block       = lines[2059:]          # ReelStripRow, FeedScreen, styles

# ------------------------------------------------------------------
# 1. Build components/FeedPost.tsx
# ------------------------------------------------------------------
# Export shared utilities
exported_helpers = []
for line in helpers_block:
    if line.startswith('function timeAgo'):
        line = line.replace('function timeAgo', 'export function timeAgo', 1)
    elif line.startswith('interface PostProfile'):
        line = line.replace('interface PostProfile', 'export interface PostProfile', 1)
    elif line.startswith('interface Post {'):
        line = line.replace('interface Post {', 'export interface Post {', 1)
    elif line.startswith('interface FeedPostProps'):
        line = line.replace('interface FeedPostProps', 'export interface FeedPostProps', 1)
    elif line.startswith('function fmtCount'):
        line = line.replace('function fmtCount', 'export function fmtCount', 1)
    exported_helpers.append(line)

# Export FeedPost and ReelPreview (ReelPreview is used by ReelStripRow in FeedScreen)
exported_fp = []
for line in fp_block:
    if line.startswith('const FeedPost = React.memo('):
        line = line.replace('const FeedPost = React.memo(', 'export const FeedPost = React.memo(', 1)
    elif line.startswith('const ReelPreview'):
        line = line.replace('const ReelPreview', 'export const ReelPreview', 1)
    exported_fp.append(line)

# Trim imports not needed in FeedPost.tsx
clean_skip = {'LiveScreen', 'TrendingScreen'}
cleaned_imports = [l for l in imports_block if not any(s in l for s in clean_skip)]

with open('components/FeedPost.tsx', 'w', encoding='utf-8') as f:
    f.writelines(cleaned_imports)
    f.writelines(width_dims_block)
    f.writelines(exported_helpers)
    f.writelines(thread_block)
    f.writelines(exported_fp)

total = len(cleaned_imports) + len(width_dims_block) + len(exported_helpers) + len(thread_block) + len(exported_fp)
print(f'  components/FeedPost.tsx: {total} lines')

# ------------------------------------------------------------------
# 2. Rewrite screens/FeedScreen.tsx
# ------------------------------------------------------------------
feedpost_import = (
    "import { FeedPost, ReelPreview, timeAgo, fmtCount, "
    "type PostProfile, type Post, type FeedPostProps } from '../components/FeedPost';\n"
)

new_feed_screen = (
    imports_block
    + [feedpost_import]
    + width_dims_block
    + cache_block
    + story_block
    + rest_block
)

with open('screens/FeedScreen.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_feed_screen)

print(f'  screens/FeedScreen.tsx: {len(new_feed_screen)} lines')
print('Done.')
