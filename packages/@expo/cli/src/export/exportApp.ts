import fs from 'fs';
import path from 'path';

import { createBundlesAsync } from './createBundles';
import { exportAssetsAsync, exportCssAssetsAsync } from './exportAssets';
import { unstable_exportStaticAsync } from './exportStaticAsync';
import { getVirtualFaviconAssetsAsync } from './favicon';
import { getPublicExpoManifestAsync } from './getPublicExpoManifest';
import { persistMetroAssetsAsync } from './persistMetroAssets';
import { printBundleSizes } from './printBundleSizes';
import { Options } from './resolveOptions';
import {
  writeAssetMapAsync,
  writeBundlesAsync,
  writeDebugHtmlAsync,
  writeMetadataJsonAsync,
  writeSourceMapsAsync,
} from './writeContents';
import * as Log from '../log';
import { createTemplateHtmlFromExpoConfigAsync } from '../start/server/webTemplate';
import { copyAsync, ensureDirectoryAsync } from '../utils/dir';
import { env } from '../utils/env';
import { setNodeEnv } from '../utils/nodeEnv';

/**
 * The structure of the outputDir will be:
 *
 * ```
 * ├── assets
 * │   └── *
 * ├── bundles
 * │   ├── android-01ee6e3ab3e8c16a4d926c91808d5320.js
 * │   └── ios-ee8206cc754d3f7aa9123b7f909d94ea.js
 * └── metadata.json
 * ```
 */
export async function exportAppAsync(
  projectRoot: string,
  {
    platforms,
    outputDir,
    clear,
    dev,
    dumpAssetmap,
    dumpSourcemap,
    minify,
  }: Pick<
    Options,
    'dumpAssetmap' | 'dumpSourcemap' | 'dev' | 'clear' | 'outputDir' | 'platforms' | 'minify'
  >
): Promise<void> {
  setNodeEnv(dev ? 'development' : 'production');
  require('@expo/env').load(projectRoot);

  const exp = await getPublicExpoManifestAsync(projectRoot);

  const useWebSSG = exp.web?.output === 'static';
  const assetPrefix = exp.assetPrefix?.replace(/\/+$/, '') ?? '';
  const publicPath = path.resolve(projectRoot, env.EXPO_PUBLIC_FOLDER);

  const outputPath = path.resolve(projectRoot, outputDir);
  const staticFolder = outputPath;
  const assetsPath = path.join(staticFolder, 'assets');
  const bundlesPath = path.join(staticFolder, 'bundles');

  await Promise.all([assetsPath, bundlesPath].map(ensureDirectoryAsync));

  await copyPublicFolderAsync(publicPath, staticFolder);

  // Run metro bundler and create the JS bundles/source maps.
  const bundles = await createBundlesAsync(
    projectRoot,
    { resetCache: !!clear },
    {
      platforms,
      minify,
      // TODO: Breaks asset exports
      // platforms: useWebSSG ? platforms.filter((platform) => platform !== 'web') : platforms,
      dev,
      // TODO: Disable source map generation if we aren't outputting them.
    }
  );

  const bundleEntries = Object.entries(bundles);
  if (bundleEntries.length) {
    // Log bundle size info to the user
    printBundleSizes(
      Object.fromEntries(
        bundleEntries.map(([key, value]) => {
          if (!dumpSourcemap) {
            return [
              key,
              {
                ...value,
                // Remove source maps from the bundles if they aren't going to be written.
                map: undefined,
              },
            ];
          }

          return [key, value];
        })
      )
    );
  }

  // Write the JS bundles to disk, and get the bundle file names (this could change with async chunk loading support).
  const { hashes, fileNames } = await writeBundlesAsync({ bundles, outputDir: bundlesPath });

  Log.log('Finished saving JS Bundles');

  if (platforms.includes('web')) {
    if (useWebSSG) {
      await unstable_exportStaticAsync(projectRoot, {
        outputDir: outputPath,
        // TODO: Expose
        minify,
        assetPrefix,
      });
      Log.log('Finished saving static files');
    } else {
      const cssLinks = await exportCssAssetsAsync({
        outputDir,
        bundles,
        assetPrefix,
      });
      let html = await createTemplateHtmlFromExpoConfigAsync(projectRoot, {
        scripts: [`${assetPrefix}/bundles/${fileNames.web}`],
        cssLinks,
      });
      // Add the favicon assets to the HTML.
      const modifyHtml = await getVirtualFaviconAssetsAsync(projectRoot, {
        outputDir,
        assetPrefix,
      });
      if (modifyHtml) {
        html = modifyHtml(html);
      }
      // Generate SPA-styled HTML file.
      // If web exists, then write the template HTML file.
      await fs.promises.writeFile(path.join(staticFolder, 'index.html'), html);
    }

    if (bundles.web) {
      // Save assets like a typical bundler, preserving the file paths on web.
      // TODO: Update React Native Web to support loading files from asset hashes.
      await persistMetroAssetsAsync(bundles.web.assets, {
        platform: 'web',
        outputDirectory: staticFolder,
        assetPrefix,
      });
    }
  }

  const { assets } = await exportAssetsAsync(projectRoot, {
    exp,
    outputDir: staticFolder,
    bundles,
  });

  if (dumpAssetmap) {
    Log.log('Dumping asset map');
    await writeAssetMapAsync({ outputDir: staticFolder, assets });
  }

  // build source maps
  if (dumpSourcemap) {
    Log.log('Dumping source maps');
    await writeSourceMapsAsync({
      bundles,
      hashes,
      outputDir: bundlesPath,
      fileNames,
    });

    Log.log('Preparing additional debugging files');
    // If we output source maps, then add a debug HTML file which the user can open in
    // the web browser to inspect the output like web.
    await writeDebugHtmlAsync({
      outputDir: staticFolder,
      fileNames,
    });
  }

  // Generate a `metadata.json` and the export is complete.
  await writeMetadataJsonAsync({ outputDir: staticFolder, bundles, fileNames });
}

/**
 * Copy the contents of the public folder into the output folder.
 * This enables users to add static files like `favicon.ico` or `serve.json`.
 *
 * The contents of this folder are completely universal since they refer to
 * static network requests which fall outside the scope of React Native's magic
 * platform resolution patterns.
 */
async function copyPublicFolderAsync(publicFolder: string, outputFolder: string) {
  if (fs.existsSync(publicFolder)) {
    await copyAsync(publicFolder, outputFolder);
  }
}
